#!/usr/bin/env python3
"""
生成 PWA / iOS 需要的图标 PNG。

为什么需要这个脚本：manifest 里声明了 icon-192.png / icon-512.png，
但 public/ 下**只有 favicon.svg** —— 图标从来没被生成过，
线上对这两个文件的请求一直是 404，导致"添加到主屏幕"的图标是空白的。

用法（需要 Pillow；本仓库的开发环境已自带）：
    python scripts/make-icons.py

产物（写入 apps/web/public/）：
    icon-192.png            192x192  圆角，供 Android / 桌面浏览器
    icon-512.png            512x512  圆角，同上
    icon-maskable-512.png   512x512  满幅、图形缩到安全区内，供 Android 自适应图标
    apple-touch-icon.png    180x180  满幅正方形（iOS 会自己裁圆角，图片本身不能带圆角）
    icon-1024.png           1024x1024 满幅，留给将来上架 App Store 用

图形与 public/favicon.svg 保持一致：靛蓝底 + 白色时钟。
"""

from pathlib import Path

from PIL import Image, ImageDraw

# 与 favicon.svg / manifest.theme_color 保持一致
BRAND = (79, 70, 229)  # #4f46e5
WHITE = (255, 255, 255)

OUT_DIR = Path(__file__).resolve().parent.parent / "apps" / "web" / "public"

# 超采样倍数：先按 N 倍画再缩小，边缘才不会有锯齿
SS = 4


def rounded_bg(size: int, radius_ratio: float) -> Image.Image:
    """圆角矩形底色（角上透明），和 favicon.svg 的 rx=14/64 比例一致"""
    img = Image.new("RGBA", (size * SS, size * SS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    r = int(size * SS * radius_ratio)
    draw.rounded_rectangle([0, 0, size * SS - 1, size * SS - 1], radius=r, fill=BRAND)
    return img


def square_bg(size: int) -> Image.Image:
    """满幅底色：iOS 与 maskable 图标必须铺满，留白由系统自己裁"""
    return Image.new("RGBA", (size * SS, size * SS), BRAND)


def draw_clock(img: Image.Image, size: int, scale: float) -> None:
    """在正中画一个表盘。scale 控制表盘占整个画布的比例（安全区用小的）"""
    draw = ImageDraw.Draw(img)
    c = size * SS / 2
    r = size * SS * scale / 2
    stroke = max(2, int(size * SS * 0.055 * (scale / 0.53)))

    # 圆环
    draw.ellipse([c - r, c - r, c + r, c + r], outline=WHITE, width=stroke)

    # 分针（向上）与时针（向右偏下），与 favicon.svg 的 "12 点 + 4 点方向" 一致
    draw.line([c, c, c, c - r * 0.72], fill=WHITE, width=stroke)
    draw.line([c, c, c + r * 0.5, c + r * 0.3], fill=WHITE, width=stroke)

    # 中心点
    dot = stroke * 0.85
    draw.ellipse([c - dot, c - dot, c + dot, c + dot], fill=WHITE)


def make(size: int, *, style: str, scale: float, name: str) -> None:
    if style == "rounded":
        img = rounded_bg(size, 14 / 64)
    else:
        img = square_bg(size)
    draw_clock(img, size, scale)
    out = img.resize((size, size), Image.LANCZOS)
    path = OUT_DIR / name
    out.save(path, "PNG", optimize=True)
    print(f"  {name:26} {size}x{size}  {path.stat().st_size:>6} bytes  ({style})")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"输出目录：{OUT_DIR}")

    # 圆角版：给浏览器标签页 / Android 普通图标用，观感与 favicon.svg 一致
    make(192, style="rounded", scale=0.53, name="icon-192.png")
    make(512, style="rounded", scale=0.53, name="icon-512.png")

    # maskable：Android 会把图标裁成各种形状，图形必须缩进中间约 80% 的安全区
    make(512, style="square", scale=0.40, name="icon-maskable-512.png")

    # iOS 主屏幕图标：满幅正方形（系统自己裁圆角），图形略小以免被裁掉
    make(180, style="square", scale=0.46, name="apple-touch-icon.png")

    # 留给将来上架 App Store（要求 1024 且不能有透明通道）
    make(1024, style="square", scale=0.46, name="icon-1024.png")


if __name__ == "__main__":
    main()
