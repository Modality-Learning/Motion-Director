// Encodes a folder of PNG frames (f00000.png …, sized from the first frame) with AVFoundation: H.264 MP4 or ProRes MOV.
// usage: encode <framesDir> <out> <fps>   env: CODEC (h264 | prores422hq | prores4444), BITRATE (h264 only)
import AVFoundation
import CoreGraphics
import ImageIO
import Foundation

let args = CommandLine.arguments
let dir = URL(fileURLWithPath: args[1])
let out = URL(fileURLWithPath: args[2])
let fps = Int32(args.count > 3 ? Int(args[3])! : 60)
var W = 1920, H = 1080

let files = try FileManager.default.contentsOfDirectory(atPath: dir.path)
  .filter { $0.hasSuffix(".png") }.sorted()
// size the video from the first frame, so higher-resolution captures encode at their own size
if let s0 = CGImageSourceCreateWithURL(dir.appendingPathComponent(files[0]) as CFURL, nil),
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
for (i, name) in files.enumerated() {
  autoreleasepool {
    let url = dir.appendingPathComponent(name)
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
          let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { fatalError("bad frame \(name)") }
    while !input.isReadyForMoreMediaData { usleep(2000) }
    var pb: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
    let buf = pb!
    CVPixelBufferLockBaseAddress(buf, [])
    let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: W, height: H, bitsPerComponent: 8,
                        bytesPerRow: CVPixelBufferGetBytesPerRow(buf), space: space,
                        bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
    ctx.draw(img, in: CGRect(x: 0, y: 0, width: W, height: H))
    CVPixelBufferUnlockBaseAddress(buf, [])
    if !adaptor.append(buf, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps)) {
      fatalError("append failed at \(i): \(String(describing: writer.error))")
    }
    if i % 300 == 0 { print("encoded", i, "/", files.count) }
  }
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
print(writer.status == .completed ? "ok \(files.count) frames -> \(out.path)" : "failed: \(String(describing: writer.error))")
