import wave, struct, math, os

out = os.path.join(os.path.dirname(__file__), "track.wav")
rate = 44100
duration = 24.0
n = int(rate * duration)

progression = [
    (220.00, 277.18, 329.63),
    (196.00, 246.94, 293.66),
    (174.61, 220.00, 261.63),
    (261.63, 329.63, 392.00),
]

frames = []
for i in range(n):
    t = i / rate
    seg = int(t // 6) % len(progression)
    f1, f2, f3 = progression[seg]
    env = 0.22 + 0.78 * (0.5 + 0.5 * math.sin(math.pi * (t % 6) / 6))
    fade = min(1.0, t / 2.0, (duration - t) / 3.0)
    amp = 0.16 * env * max(0.0, fade)
    left = (math.sin(2 * math.pi * f1 * t) + 0.6 * math.sin(2 * math.pi * f2 * t) + 0.35 * math.sin(2 * math.pi * f3 * t)) * amp
    right = (math.sin(2 * math.pi * f1 * t + 0.05) + 0.6 * math.sin(2 * math.pi * f2 * t - 0.03) + 0.35 * math.sin(2 * math.pi * f3 * t + 0.08)) * amp
    frames.append((left, right))

with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(rate)
    data = bytearray()
    for left, right in frames:
        data += struct.pack("<hh", int(max(-1, min(1, left)) * 32767), int(max(-1, min(1, right)) * 32767))
    w.writeframes(data)

print(out, os.path.getsize(out))
