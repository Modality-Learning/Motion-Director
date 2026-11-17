// Encodes a folder of PNG frames (f00000.png …, sized from the first frame) with AVFoundation: H.264 MP4 or ProRes MOV.
// usage: encode <framesDir> <out> <fps> [total]   env: CODEC (h264 | prores422hq | prores4444), BITRATE (h264 only)
//   total: encode f00000.png to f<total-1>.png, waiting for each to appear, so it can run while the frames are still
//   being captured (capture.mjs renames each frame into place only when it's complete). Without it, the folder's
//   PNGs as they are now. Frames are decoded several at once, on every core, and appended in order.
import AVFoundation
import CoreGraphics
import ImageIO
import Foundation

let args = CommandLine.arguments
let dir = URL(fileURLWithPath: args[1])
let out = URL(fileURLWithPath: args[2])
let fps = Int32(args.count > 3 ? Int(args[3])! : 60)
let waiting = args.count > 4
var W = 1920, H = 1080

let files: [String] = waiting
  ? (0..<Int(args[4])!).map { String(format: "f%05d.png", $0) }
  : try FileManager.default.contentsOfDirectory(atPath: dir.path).filter { $0.hasSuffix(".png") }.sorted()
guard !files.isEmpty else { fatalError("no frames in \(dir.path)") }

/// Waits until a frame is there (only when encoding alongside the capture). A capture that stops sending frames
/// for this long has failed; render.sh also stops the encoder when a capture fails.
func waitFor(_ url: URL) {
  guard waiting else { return }
  var waited = 0.0
  while !FileManager.default.fileExists(atPath: url.path) {
    usleep(20_000); waited += 0.02
    if waited > 300 { fatalError("no frame \(url.lastPathComponent) after 5 minutes") }
  }
}
// size the video from the first frame, so higher-resolution captures encode at their own size
let first = dir.appendingPathComponent(files[0])
waitFor(first)
if let s0 = CGImageSourceCreateWithURL(first as CFURL, nil),
   let i0 = CGImageSourceCreateImageAtIndex(s0, 0, nil) { W = i0.width; H = i0.height }
try? FileManager.default.removeItem(at: out)

// CODEC: h264 (default, for sharing) | prores422hq | prores4444 (masters for editing: visually lossless,
// so an editor's export is the only lossy step). ProRes writes a QuickTime .mov.
let codec = ProcessInfo.processInfo.environment["CODEC"] ?? "h264"
let prores: [String: AVVideoCodecType] = ["prores422hq": .proRes422HQ, "prores4444": .proRes4444]
var settings: [String: Any] = [AVVideoWidthKey: W, AVVideoHeightKey: H]
if let pr = prores[codec] {
  settings[AVVideoCodecKey] = pr
} else {
  settings[AVVideoCodecKey] = AVVideoCodecType.h264
  settings[AVVideoCompressionPropertiesKey] = [
    AVVideoAverageBitRateKey: Int(ProcessInfo.processInfo.environment["BITRATE"] ?? "24000000")!,
    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    AVVideoMaxKeyFrameIntervalKey: Int(fps),
    AVVideoExpectedSourceFrameRateKey: Int(fps),
  ]
}
let writer = try AVAssetWriter(outputURL: out, fileType: prores[codec] != nil ? .mov : .mp4)
settings[AVVideoColorPropertiesKey] = [
  AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
  AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
  AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
]
let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
  kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H,
])
writer.add(input)
guard writer.startWriting() else { fatalError("start failed: \(String(describing: writer.error))") }
writer.startSession(atSourceTime: .zero)

let space = CGColorSpace(name: CGColorSpace.sRGB)!
let pool = adaptor.pixelBufferPool!

/// A frame decoded into a pixel buffer from the writer's pool.
func decode(_ name: String) -> CVPixelBuffer {
  let url = dir.appendingPathComponent(name)
  waitFor(url)
  guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
        let img = CGImageSourceCreateImageAtIndex(src, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary)
  else { fatalError("bad frame \(name)") }
  var pb: CVPixelBuffer?
  CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pb)
  let buf = pb!
  CVPixelBufferLockBaseAddress(buf, [])
  let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: W, height: H, bitsPerComponent: 8,
                      bytesPerRow: CVPixelBufferGetBytesPerRow(buf), space: space,
                      bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
  ctx.draw(img, in: CGRect(x: 0, y: 0, width: W, height: H))
  CVPixelBufferUnlockBaseAddress(buf, [])
  return buf
}

// decoding runs ahead of the writer by up to `ahead` frames, on every core; the writer takes them in order
let ahead = max(4, ProcessInfo.processInfo.activeProcessorCount)
let room = DispatchSemaphore(value: ahead)
let ready = files.map { _ in DispatchSemaphore(value: 0) }
var decoded = [Int: CVPixelBuffer]()
let lock = NSLock()
let decoders = DispatchQueue(label: "decode", attributes: .concurrent)
Thread.detachNewThread {
  for (i, name) in files.enumerated() {
    room.wait()
    decoders.async {
      let buf = autoreleasepool { decode(name) }
      lock.lock(); decoded[i] = buf; lock.unlock()
      ready[i].signal()
    }
  }
}
for i in files.indices {
  ready[i].wait()
  lock.lock(); let buf = decoded.removeValue(forKey: i)!; lock.unlock()
  while !input.isReadyForMoreMediaData { usleep(2000) }
  if !adaptor.append(buf, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps)) {
    fatalError("append failed at \(i): \(String(describing: writer.error))")
  }
  room.signal()
  if i % 300 == 0 { print("encoded", i, "/", files.count); fflush(stdout) }
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
print(writer.status == .completed ? "ok \(files.count) frames -> \(out.path)" : "failed: \(String(describing: writer.error))")
