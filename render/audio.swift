// Promo audio tool, built on AVFoundation (macOS), so sound needs nothing installed.
//   audio mix <plan.json> <out.wav>              mixes a film's voices into a 48 kHz, 24-bit stereo WAV
//   audio stretch <in> <out.wav> <from> <to|-> <rate>   a trimmed sound at a new speed, pitch kept (studio previews)
//   audio mux <video> <sound.wav> <out> <aac|pcm>        adds the sound to a video, copying the picture as encoded
//   audio info <file>                            prints a sound's length in seconds
//   audio analyze <file>...                      measures each sound (one JSON line each), for the studio's library
// Plan: { "duration": 35, "voices": [{ "file": "/abs/x.wav", "at": 1.2, "from": 0, "to": null, "gain": -6,
//         "rate": 1.5, "keepPitch": true, "fadeIn": 0, "fadeOut": 0.1 }] }  (see kit/sound.mjs resolveVoices)
// Build: DEVELOPER_DIR=/Library/Developer/CommandLineTools swiftc -O audio.swift -o audio
import AVFoundation
import Foundation

let SR = 48000.0
let stereo = AVAudioFormat(standardFormatWithSampleRate: SR, channels: 2)!
func fail(_ m: String) -> Never { FileHandle.standardError.write((m + "\n").data(using: .utf8)!); exit(1) }

/// The whole file through AVAssetReader: for audio AVAudioFile can't read, such as Opus in an .m4a.
func decodeAsset(_ url: URL) throws -> AVAudioPCMBuffer {
  let asset = AVURLAsset(url: url)
  guard let track = asset.tracks(withMediaType: .audio).first, let desc = track.formatDescriptions.first,
        let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(desc as! CMAudioFormatDescription)?.pointee else { fail("no audio in \(url.path)") }
  let sr = asbd.mSampleRate > 0 ? asbd.mSampleRate : SR, ch = AVAudioChannelCount(max(1, min(2, Int(asbd.mChannelsPerFrame))))
  let reader = try AVAssetReader(asset: asset)
  let output = AVAssetReaderTrackOutput(track: track, outputSettings: [AVFormatIDKey: kAudioFormatLinearPCM, AVLinearPCMBitDepthKey: 32, AVLinearPCMIsFloatKey: true,
    AVLinearPCMIsNonInterleaved: false, AVLinearPCMIsBigEndianKey: false, AVSampleRateKey: sr, AVNumberOfChannelsKey: Int(ch)])
  reader.add(output)
  guard reader.startReading() else { fail("cannot decode \(url.path): \(String(describing: reader.error))") }
  var interleaved: [Float] = []
  while let sb = output.copyNextSampleBuffer() {
    guard let block = CMSampleBufferGetDataBuffer(sb) else { continue }
    let n = CMBlockBufferGetDataLength(block)
    var chunk = [Float](repeating: 0, count: n / 4)
    _ = chunk.withUnsafeMutableBytes { CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: n, destination: $0.baseAddress!) }
    interleaved.append(contentsOf: chunk)
  }
  let frames = interleaved.count / Int(ch)
  let buf = AVAudioPCMBuffer(pcmFormat: AVAudioFormat(standardFormatWithSampleRate: sr, channels: ch)!, frameCapacity: AVAudioFrameCount(max(frames, 1)))!
  for c in 0..<Int(ch) { let d = buf.floatChannelData![c]; for i in 0..<frames { d[i] = interleaved[i * Int(ch) + c] } }
  buf.frameLength = AVAudioFrameCount(frames)
  return buf
}

/// The whole file in its own format, by whichever reader can open it.
func readAll(_ url: URL) throws -> AVAudioPCMBuffer {
  if let f = try? AVAudioFile(forReading: url), f.length > 0 { return try readSegment(url, from: 0, to: nil) }
  return try decodeAsset(url)
}

/// Reads [from, to) of a sound file, in its own format.
func readSegment(_ url: URL, from: Double, to: Double?) throws -> AVAudioPCMBuffer {
  guard let f = try? AVAudioFile(forReading: url), f.length > 0 else {
    // a file only the asset reader can decode: decode it all, then keep [from, to)
    let all = try decodeAsset(url), sr = all.format.sampleRate, total = Int(all.frameLength)
    let a = max(0, min(total, Int(from * sr))), b = max(a, min(total, to.map { Int($0 * sr) } ?? total))
    let seg = AVAudioPCMBuffer(pcmFormat: all.format, frameCapacity: AVAudioFrameCount(max(b - a, 1)))!
    for c in 0..<Int(all.format.channelCount) { for i in 0..<(b - a) { seg.floatChannelData![c][i] = all.floatChannelData![c][a + i] } }
    seg.frameLength = AVAudioFrameCount(b - a)
    return seg
  }
  let sr = f.processingFormat.sampleRate
  let start = max(0, min(f.length, AVAudioFramePosition(from * sr)))
  let end = max(start, to.map { min(f.length, AVAudioFramePosition($0 * sr)) } ?? f.length)
  let n = AVAudioFrameCount(end - start)
  guard let buf = AVAudioPCMBuffer(pcmFormat: f.processingFormat, frameCapacity: max(n, 1)) else { fail("cannot read \(url.path)") }
  f.framePosition = start
  if n > 0 { try f.read(into: buf, frameCount: n) }
  return buf
}

/// The segment at 48 kHz stereo and a new speed: time-stretched with its pitch kept (AVAudioUnitTimePitch),
/// or tape-style, pitch moving with speed (AVAudioUnitVarispeed). Rendered offline, so it is exact and fast.
func process(_ seg: AVAudioPCMBuffer, rate: Double, keepPitch: Bool) throws -> AVAudioPCMBuffer {
  let engine = AVAudioEngine(), player = AVAudioPlayerNode()
  engine.attach(player)
  var latency = 0.0
  if abs(rate - 1) > 1e-6 {
    let fx: AVAudioUnit
    if keepPitch { let u = AVAudioUnitTimePitch(); u.rate = Float(rate); fx = u } else { let u = AVAudioUnitVarispeed(); u.rate = Float(rate); fx = u }
    engine.attach(fx)
    engine.connect(player, to: fx, format: seg.format)
    engine.connect(fx, to: engine.mainMixerNode, format: seg.format)
    latency = fx.auAudioUnit.latency
  } else {
    engine.connect(player, to: engine.mainMixerNode, format: seg.format) // the mixer resamples and makes mono stereo
  }
  try engine.enableManualRenderingMode(.offline, format: stereo, maximumFrameCount: 4096)
  try engine.start()
  player.scheduleBuffer(seg, completionHandler: nil)
  player.play()
  let want = Int((Double(seg.frameLength) / seg.format.sampleRate / rate * SR).rounded())
  let skip = Int((latency * SR).rounded()) // the effect delays its output; drop that much from the front
  let out = AVAudioPCMBuffer(pcmFormat: stereo, frameCapacity: AVAudioFrameCount(max(want, 1)))!
  let chunk = AVAudioPCMBuffer(pcmFormat: engine.manualRenderingFormat, frameCapacity: 4096)!
  var done = 0
  while done < want + skip {
    let status = try engine.renderOffline(AVAudioFrameCount(min(4096, want + skip - done)), to: chunk)
    if status != .success { break }
    let n = Int(chunk.frameLength)
    for c in 0..<2 {
      let src = chunk.floatChannelData![c], dst = out.floatChannelData![c]
      for i in 0..<n { let p = done + i - skip; if p >= 0 && p < want { dst[p] = src[i] } }
    }
    done += n
  }
  out.frameLength = AVAudioFrameCount(want)
  engine.stop()
  return out
}

func writeWav(_ url: URL, _ L: [Float], _ R: [Float], bits: Int) throws {
  try? FileManager.default.removeItem(at: url)
  let settings: [String: Any] = [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: SR, AVNumberOfChannelsKey: 2,
                                 AVLinearPCMBitDepthKey: bits, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false]
  let file = try AVAudioFile(forWriting: url, settings: settings, commonFormat: .pcmFormatFloat32, interleaved: false)
  let step = 65536
  let buf = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(step))!
  var i = 0
  while i < L.count {
    let n = min(step, L.count - i)
    for k in 0..<n { buf.floatChannelData![0][k] = max(-1, min(1, L[i + k])); buf.floatChannelData![1][k] = max(-1, min(1, R[i + k])) }
    buf.frameLength = AVAudioFrameCount(n)
    try file.write(from: buf)
    i += n
  }
}

struct Voice: Decodable { let file: String; let at: Double; let from: Double; let to: Double?; let gain: Double; let rate: Double; let keepPitch: Bool; let fadeIn: Double; let fadeOut: Double }
struct Plan: Decodable { let duration: Double; let voices: [Voice] }

func mix(_ planURL: URL, _ out: URL) throws {
  let plan = try JSONDecoder().decode(Plan.self, from: Data(contentsOf: planURL))
  let total = Int((plan.duration * SR).rounded())
  var L = [Float](repeating: 0, count: total), R = [Float](repeating: 0, count: total)
  var cache: [String: AVAudioPCMBuffer] = [:] // one sound repeated (every event popping in) is processed once
  for v in plan.voices {
    let key = "\(v.file)|\(v.from)|\(v.to ?? -1)|\(v.rate)|\(v.keepPitch)"
    if cache[key] == nil { cache[key] = try process(try readSegment(URL(fileURLWithPath: v.file), from: v.from, to: v.to), rate: v.rate, keepPitch: v.keepPitch) }
    let b = cache[key]!, n = Int(b.frameLength), g = Float(pow(10, v.gain / 20))
    let fi = v.fadeIn * SR, fo = v.fadeOut * SR, start = Int((v.at * SR).rounded())
    let l = b.floatChannelData![0], r = b.floatChannelData![1]
    for i in 0..<n {
      let p = start + i
      if p < 0 { continue }
      if p >= total { break }
      var e = g
      if fi > 0 && Double(i) < fi { e *= Float(Double(i) / fi) }
      if fo > 0 && Double(n - i) < fo { e *= Float(Double(n - i) / fo) }
      L[p] += l[i] * e; R[p] += r[i] * e
    }
  }
  let peak = max(L.map(abs).max() ?? 0, R.map(abs).max() ?? 0)
  try writeWav(out, L, R, bits: 24)
  print(String(format: "mixed %d voices, peak %.1f dBFS%@", plan.voices.count, 20 * log10(Double(max(peak, 1e-9))), peak > 1 ? " (clipped: turn the master down)" : ""))
}

func stretch(_ input: URL, _ out: URL, from: Double, to: Double?, rate: Double) throws {
  let b = try process(try readSegment(input, from: from, to: to), rate: rate, keepPitch: true)
  let n = Int(b.frameLength)
  try writeWav(out, Array(UnsafeBufferPointer(start: b.floatChannelData![0], count: n)), Array(UnsafeBufferPointer(start: b.floatChannelData![1], count: n)), bits: 16)
}

/// Adds the sound to a video: the picture is copied sample for sample, the sound encoded as AAC (MP4) or
/// kept uncompressed (ProRes MOV).
func mux(video: URL, sound: URL, out: URL, aac: Bool) throws {
  let va = AVURLAsset(url: video), aa = AVURLAsset(url: sound)
  guard let vt = va.tracks(withMediaType: .video).first, let at = aa.tracks(withMediaType: .audio).first else { fail("missing a video or sound track") }
  let vr = try AVAssetReader(asset: va), ar = try AVAssetReader(asset: aa)
  let vo = AVAssetReaderTrackOutput(track: vt, outputSettings: nil)
  let ao = AVAssetReaderTrackOutput(track: at, outputSettings: [AVFormatIDKey: kAudioFormatLinearPCM, AVLinearPCMBitDepthKey: 32, AVLinearPCMIsFloatKey: true,
                                                               AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false])
  vr.add(vo); ar.add(ao)
  try? FileManager.default.removeItem(at: out)
  let writer = try AVAssetWriter(outputURL: out, fileType: out.pathExtension.lowercased() == "mov" ? .mov : .mp4)
  let vi = AVAssetWriterInput(mediaType: .video, outputSettings: nil, sourceFormatHint: (vt.formatDescriptions.first as! CMFormatDescription))
  vi.transform = vt.preferredTransform
  var layout = AudioChannelLayout(); layout.mChannelLayoutTag = kAudioChannelLayoutTag_Stereo
  let layoutData = Data(bytes: &layout, count: MemoryLayout<AudioChannelLayout>.size)
  let aSettings: [String: Any] = aac
    ? [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: SR, AVNumberOfChannelsKey: 2, AVEncoderBitRateKey: 320_000, AVChannelLayoutKey: layoutData]
    : [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: SR, AVNumberOfChannelsKey: 2, AVLinearPCMBitDepthKey: 24, AVLinearPCMIsFloatKey: false,
       AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false, AVChannelLayoutKey: layoutData]
  let ai = AVAssetWriterInput(mediaType: .audio, outputSettings: aSettings)
  vi.expectsMediaDataInRealTime = false; ai.expectsMediaDataInRealTime = false
  writer.add(vi); writer.add(ai)
  guard vr.startReading(), ar.startReading(), writer.startWriting() else { fail("mux failed to start: \(String(describing: writer.error ?? vr.error ?? ar.error))") }
  writer.startSession(atSourceTime: .zero)
  let group = DispatchGroup()
  for (input, output, name) in [(vi, vo, "video"), (ai, ao, "audio")] {
    group.enter()
    input.requestMediaDataWhenReady(on: DispatchQueue(label: name)) {
      while input.isReadyForMoreMediaData {
        if let s = output.copyNextSampleBuffer() { if !input.append(s) { input.markAsFinished(); group.leave(); return } }
        else { input.markAsFinished(); group.leave(); return }
      }
    }
  }
  group.wait()
  let done = DispatchSemaphore(value: 0)
  writer.finishWriting { done.signal() }
  done.wait()
  if writer.status != .completed { fail("mux failed: \(String(describing: writer.error))") }
  print("ok sound -> \(out.path)")
}

/// What a sound is like, measured from its loudness every 10 ms: where it lands (hit), how fast it gets there
/// (attack), how long it rings (decay), how much of it is loud (sustain), how many separate hits it has (onsets),
/// and how bright it is (zero crossings a second, roughly its main frequency). One JSON line.
func analyze(_ url: URL) -> String {
  func json(_ d: [String: Any]) -> String { String(data: try! JSONSerialization.data(withJSONObject: d, options: [.sortedKeys]), encoding: .utf8)! }
  guard let b = try? readAll(url), b.frameLength > 0 else { return json(["file": url.path, "ok": false]) }
  let sr = b.format.sampleRate, n = Int(b.frameLength), chs = Int(b.format.channelCount)
  var mono = [Float](repeating: 0, count: n)
  for c in 0..<chs { let d = b.floatChannelData![c]; for i in 0..<n { mono[i] += d[i] / Float(chs) } }
  let hop = max(1, Int(sr * 0.01)), wins = max(1, n / hop)
  var env = [Double](repeating: 0, count: wins), zc = [Int](repeating: 0, count: wins)
  var peak: Float = 0
  for w in 0..<wins {
    var e = 0.0, z = 0
    for i in (w * hop)..<min(n, (w + 1) * hop) {
      e += Double(mono[i] * mono[i]); peak = max(peak, abs(mono[i]))
      if i > 0 && (mono[i] >= 0) != (mono[i - 1] >= 0) { z += 1 }
    }
    env[w] = sqrt(e / Double(hop)); zc[w] = z
  }
  let top = env.max() ?? 0
  guard top > 1e-6 else { return json(["file": url.path, "ok": true, "length": Double(n) / sr, "silent": true]) }
  let hitW = env.firstIndex(of: top)!
  let start = env.firstIndex { $0 >= top * 0.1 } ?? 0, end = env.lastIndex { $0 >= top * 0.1 } ?? wins - 1
  var loud = 0, onsets = 0, last = -100, energy = 0.0, crossings = 0.0, rms = 0.0
  for w in start...end {
    if env[w] >= top * 0.5 { loud += 1 }
    let before = env[max(0, w - 5)..<w], avg = before.isEmpty ? 0 : before.reduce(0, +) / Double(before.count)
    if env[w] > top * 0.15 && env[w] > avg * 1.8 && w - last >= 6 { onsets += 1; last = w }
    energy += env[w] * env[w]; crossings += Double(zc[w]) * env[w] * env[w]; rms += env[w] * env[w]
  }
  let active = Double(end - start + 1) * 0.01
  let zcrHz = energy > 0 ? (crossings / energy) / 0.01 / 2 : 0
  return json([
    "file": url.path, "ok": true, "length": Double(n) / sr,
    "hit": Double(hitW) * 0.01 + 0.005, "attack": Double(hitW - start) * 0.01, "decay": Double(end - hitW) * 0.01,
    "active": active, "sustain": Double(loud) / Double(end - start + 1), "onsets": onsets, "onsetRate": Double(onsets) / max(active, 0.05),
    "brightness": zcrHz, "peakDb": 20 * log10(Double(max(peak, 1e-9))), "rmsDb": 10 * log10(max(rms / Double(end - start + 1), 1e-12)),
  ])
}

let a = CommandLine.arguments
do {
  switch a.count > 1 ? a[1] : "" {
  case "mix" where a.count == 4: try mix(URL(fileURLWithPath: a[2]), URL(fileURLWithPath: a[3]))
  case "stretch" where a.count == 7:
    try stretch(URL(fileURLWithPath: a[2]), URL(fileURLWithPath: a[3]), from: Double(a[4]) ?? 0, to: a[5] == "-" ? nil : Double(a[5]), rate: Double(a[6]) ?? 1)
  case "mux" where a.count == 6: try mux(video: URL(fileURLWithPath: a[2]), sound: URL(fileURLWithPath: a[3]), out: URL(fileURLWithPath: a[4]), aac: a[5] == "aac")
  case "info" where a.count == 3:
    let b = try readAll(URL(fileURLWithPath: a[2]))
    print(String(format: "%.6f", Double(b.frameLength) / b.format.sampleRate))
  case "analyze" where a.count >= 3:
    for path in a[2...] { print(analyze(URL(fileURLWithPath: path))) }
  default: fail("usage: audio mix <plan.json> <out.wav> | stretch <in> <out.wav> <from> <to|-> <rate> | mux <video> <sound.wav> <out> <aac|pcm> | info <file> | analyze <file>...")
  }
} catch { fail("\(error)") }
