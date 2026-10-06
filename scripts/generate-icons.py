#!/usr/bin/env python3
"""Renders the extension icons (icons/icon-{16,32,48,128}.png).

Stdlib only: shapes are defined in a unit square and rasterized with
supersampling for anti-aliasing. Run: python3 scripts/generate-icons.py
"""
import math
import struct
import zlib
from pathlib import Path

SIZES = (16, 32, 48, 128)
SUPERSAMPLE = 4

BG = (26, 115, 232)  # #1a73e8, matches the badge color
FG = (255, 255, 255)
TRACK = (120, 170, 245)  # used part of the timer ring

CORNER = 0.22  # background corner radius
RING_R, RING_W = 0.33, 0.085  # timer ring radius and width
RING_LEFT = 0.70  # fraction of the ring still remaining (drawn in FG)
PLAY = ((0.43, 0.36), (0.43, 0.64), (0.65, 0.50))  # play triangle


def in_rounded_rect(x, y, r):
    cx = min(max(x, r), 1 - r)
    cy = min(max(y, r), 1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def in_triangle(x, y, tri):
    (x1, y1), (x2, y2), (x3, y3) = tri
    d1 = (x - x2) * (y1 - y2) - (x1 - x2) * (y - y2)
    d2 = (x - x3) * (y2 - y3) - (x2 - x3) * (y - y3)
    d3 = (x - x1) * (y3 - y1) - (x3 - x1) * (y - y1)
    neg = d1 < 0 or d2 < 0 or d3 < 0
    pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (neg and pos)


def sample(x, y):
    """Color at a point of the unit square, or None if transparent."""
    if not in_rounded_rect(x, y, CORNER):
        return None
    dx, dy = x - 0.5, y - 0.5
    if abs(math.hypot(dx, dy) - RING_R) <= RING_W / 2:
        # Clockwise from 12 o'clock, 0..1.
        angle = (math.atan2(dx, -dy) / (2 * math.pi)) % 1
        return FG if angle <= RING_LEFT else TRACK
    if in_triangle(x, y, PLAY):
        return FG
    return BG


def render(size):
    n = SUPERSAMPLE
    rows = []
    for py in range(size):
        row = bytearray([0])  # PNG filter: none
        for px in range(size):
            r = g = b = a = 0
            for sy in range(n):
                for sx in range(n):
                    c = sample((px + (sx + 0.5) / n) / size, (py + (sy + 0.5) / n) / size)
                    if c:
                        r, g, b, a = r + c[0], g + c[1], b + c[2], a + 1
            if a:
                row += bytes((r // a, g // a, b // a, 255 * a // (n * n)))
            else:
                row += bytes(4)
        rows.append(bytes(row))
    return png(size, b"".join(rows))


def png(size, raw):
    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def main():
    out = Path(__file__).resolve().parent.parent / "icons"
    out.mkdir(exist_ok=True)
    for size in SIZES:
        path = out / f"icon-{size}.png"
        path.write_bytes(render(size))
        print(path.relative_to(out.parent))


if __name__ == "__main__":
    main()
