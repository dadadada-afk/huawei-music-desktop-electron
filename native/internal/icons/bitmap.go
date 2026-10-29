package icons

import (
	"bytes"
	"image/png"

	"github.com/vivaui/viva/ui"
)

// Decode the embedded mark once; Canvas bitmaps use premultiplied BGRA.
var BrandBitmap = func() ui.Bitmap {
	im, err := png.Decode(bytes.NewReader(AppPNG))
	if err != nil {
		return ui.Bitmap{}
	}
	b := im.Bounds()
	pix := make([]byte, b.Dx()*b.Dy()*4)
	for y := 0; y < b.Dy(); y++ {
		for x := 0; x < b.Dx(); x++ {
			r, g, blue, a := im.At(b.Min.X+x, b.Min.Y+y).RGBA()
			at := (y*b.Dx() + x) * 4
			pix[at], pix[at+1], pix[at+2], pix[at+3] = byte(blue>>8), byte(g>>8), byte(r>>8), byte(a>>8)
		}
	}
	return ui.Bitmap{Pix: pix, Width: b.Dx(), Height: b.Dy(), Stride: b.Dx() * 4, ID: 50, Version: 1}
}()

// Preserve the pale note and shading while mapping the ruby pigment to the accent.
func ThemedBrand(tint ui.Color, version uint32) ui.Bitmap {
	b := BrandBitmap
	b.Pix = append([]byte(nil), b.Pix...)
	b.ID = 51
	b.Version = version
	for i := 0; i < len(b.Pix); i += 4 {
		blue, g, r := float32(b.Pix[i]), float32(b.Pix[i+1]), float32(b.Pix[i+2])
		pigment := max(0, r-max(g, blue))
		b.Pix[i] = byte(min(255, blue+pigment*tint.Blue))
		b.Pix[i+1] = byte(min(255, g+pigment*tint.Green))
		b.Pix[i+2] = byte(min(255, r-pigment+pigment*tint.Red))
	}
	return b
}
