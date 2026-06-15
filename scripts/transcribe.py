#!/usr/bin/env python3
"""Transcribe an audio file using Faster-Whisper.

Usage: python3 transcribe.py <audio_path> [model_size]

Outputs Markdown-formatted transcription to stdout.
For long audio (>30 min), processes in chunks to avoid OOM.
"""

import sys
import os
import subprocess
import tempfile
import json


def _fmt(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def _get_duration(audio_path):
    """Get audio duration in seconds using ffprobe."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "json", audio_path],
            capture_output=True, text=True, timeout=10,
        )
        data = json.loads(result.stdout)
        return float(data["format"]["duration"])
    except Exception:
        return None


def _split_audio(audio_path, chunk_duration=1800, tmpdir=None):
    """Split audio into chunks of chunk_duration seconds each.
    Returns list of (chunk_path, start_time) tuples."""
    duration = _get_duration(audio_path)
    if duration is None or duration <= chunk_duration:
        return [(audio_path, 0.0)]

    print(f"Audio is {duration/60:.0f} min, splitting into {chunk_duration/60:.0f} min chunks...",
          file=sys.stderr)

    chunks = []
    chunk_dir = tmpdir or tempfile.mkdtemp(prefix="whisper_chunks_")
    offset = 0.0

    while offset < duration:
        chunk_len = min(chunk_duration, duration - offset)
        chunk_path = os.path.join(chunk_dir, f"chunk_{int(offset):06d}.m4a")

        try:
            subprocess.run([
                "ffmpeg", "-y", "-nostdin",
                "-ss", str(offset), "-t", str(chunk_len),
                "-i", audio_path,
                "-ac", "1", "-ar", "16000",
                "-c:a", "aac", "-b:a", "64k",
                chunk_path,
            ], capture_output=True, check=True, timeout=60)
            chunks.append((chunk_path, offset))
        except subprocess.CalledProcessError as e:
            print(f"Failed to split chunk at {offset}s: {e.stderr.decode()[:200]}", file=sys.stderr)
            # Continue to next chunk instead of failing entirely

        offset += chunk_len

    print(f"Split into {len(chunks)} chunks", file=sys.stderr)
    return chunks


def _transcribe_segments(model, audio_path):
    """Transcribe a single audio file and return segments + info."""
    return model.transcribe(
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
        print("faster-whisper not installed. Run: pip install faster-whisper", file=sys.stderr)
        sys.exit(1)

    print(f"Loading Whisper model ({model_size})...", file=sys.stderr)
    try:
        model = WhisperModel(model_size, device="cpu", compute_type="int8")
    except Exception as e:
        print(f"Failed to load Whisper model: {e}", file=sys.stderr)
        sys.exit(1)

    # Split long audio to avoid OOM from encoder cache
    chunks = _split_audio(audio_path)

    detected_lang = None
    prob = 0.0

    # Output Markdown header
    print("# Video Transcription")
    print()

    for chunk_path, chunk_offset in chunks:
        print(f"Transcribing chunk at {chunk_offset/60:.0f}min...", file=sys.stderr)

        try:
            segments, info = _transcribe_segments(model, chunk_path)
        except Exception as e:
            print(f"Transcription failed: {e}", file=sys.stderr)
            continue

        if detected_lang is None:
            detected_lang = info.language
            prob = info.language_probability
            print(f"Detected language: {detected_lang} (prob={prob:.2f})", file=sys.stderr)
            print(f"**Detected Language:** {detected_lang}")
            print(f"**Language Probability:** {prob:.2f}")
            print()
            print("## Transcription Content")
            print()

        segment_count = 0
        for segment in segments:
            start = _fmt(segment.start + chunk_offset)
            end = _fmt(segment.end + chunk_offset)
            text = segment.text.strip()
            if text:
                print(f"**[{start} - {end}]**")
                print()
                print(text)
                print()
                segment_count += 1

        if segment_count == 0:
            print(f"(No speech detected in chunk at {chunk_offset/60:.0f}min)", file=sys.stderr)

        # Clean up temp chunk files (keep original)
        if chunk_path != audio_path:
            try:
                os.unlink(chunk_path)
            except Exception:
                pass

    # Clean up temp chunk directory
    if chunks and len(chunks) > 1:
        chunk_dir = os.path.dirname(chunks[0][0])
        try:
            os.rmdir(chunk_dir)
        except Exception:
            pass

    if detected_lang is None:
        print("(No speech detected)", file=sys.stderr)
        print("**Detected Language:** unknown")
        print("**Language Probability:** 0.00")


if __name__ == "__main__":
    main()
