import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-br from-slate-900 to-slate-800">
      <main className="flex flex-col gap-8 items-center max-w-4xl">
        <h1 className="text-6xl font-bold text-white text-center">
          Vigilante<span className="text-blue-500">AI</span>
        </h1>
        <p className="text-xl text-slate-300 text-center max-w-2xl">
          Real-time security surveillance powered by computer vision and AI
        </p>

        <div className="flex gap-4 items-center flex-wrap justify-center mt-8">
          <Link
            href="/realtime-stream"
            className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-blue-600 text-white gap-2 hover:bg-blue-700 text-sm sm:text-base h-12 px-6 font-semibold"
          >
            Start Real-Time Analysis (Phase 1)
          </Link>
          <Link
            href="/dashboard"
            className="rounded-full border border-solid border-white/20 transition-colors flex items-center justify-center hover:bg-slate-700 hover:border-transparent text-sm sm:text-base h-12 px-6 text-white font-semibold"
          >
            View Dashboard
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          <div className="p-6 bg-slate-800 rounded-lg border border-slate-700">
            <h3 className="text-lg font-semibold text-white mb-2">Phase 1: Heuristic Detection</h3>
            <p className="text-slate-400 text-sm">
              Browser-based fall detection using TensorFlow.js and MoveNet pose estimation. Zero API dependencies.
            </p>
          </div>
          <div className="p-6 bg-slate-800 rounded-lg border border-slate-700">
            <h3 className="text-lg font-semibold text-white mb-2">Phase 2: VLM Analysis</h3>
            <p className="text-slate-400 text-sm">
              Advanced event detection using Google Gemini for complex scenarios like fights and medical emergencies.
            </p>
          </div>
          <div className="p-6 bg-slate-800 rounded-lg border border-slate-700">
            <h3 className="text-lg font-semibold text-white mb-2">Real-Time Alerts</h3>
            <p className="text-slate-400 text-sm">
              Instant email notifications when dangerous events are detected with full event logging.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
