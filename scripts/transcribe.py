#!/usr/bin/env python3
"""Transcribe an audio file using Faster-Whisper.

Usage: python3 transcribe.py <audio_path> [model_size]

Outputs Markdown-formatted transcription to stdout.
"""

import sys
import os


def _fmt(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 transcribe.py <audio_path> [model_size]", file=sys.stderr)
        sys.exit(1)

    audio_path = sys.argv[1]
    model_size = sys.argv[2] if len(sys.argv) > 2 else "base"

    if not os.path.exists(audio_path):
        print(f"Audio file not found: {audio_path}", file=sys.stderr)
        sys.exit(1)

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(
            "faster-whisper not installed. Run: pip install faster-whisper",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"Loading Whisper model ({model_size})...", file=sys.stderr)
    try:
        model = WhisperModel(model_size, device="cpu", compute_type="int8")
    except Exception as e:
        print(f"Failed to load Whisper model: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Transcribing {audio_path}...", file=sys.stderr)
    try:
        segments, info = model.transcribe(
            audio_path,
            beam_size=5,
            best_of=5,
            temperature=[0.0, 0.2, 0.4],
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 900, "speech_pad_ms": 300},
            no_speech_threshold=0.7,
            compression_ratio_threshold=2.3,
            log_prob_threshold=-1.0,
            condition_on_previous_text=False,
        )
    except Exception as e:
        print(f"Transcription failed: {e}", file=sys.stderr)
        sys.exit(1)

    detected_lang = info.language
    prob = info.language_probability
    print(f"Detected language: {detected_lang} (prob={prob:.2f})", file=sys.stderr)

    print(f"**Detected Language:** {detected_lang}")
    print(f"**Language Probability:** {prob:.2f}")
    print()

    segment_count = 0
    for segment in segments:
        start = _fmt(segment.start)
        end = _fmt(segment.end)
        text = segment.text.strip()
        if text:
            print(f"**[{start} - {end}]**")
            print()
            print(text)
            print()
            segment_count += 1

    if segment_count == 0:
        print("(No speech detected)", file=sys.stderr)


if __name__ == "__main__":
    main()
