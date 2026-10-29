package typography

import "github.com/vivaui/viva/ui"

// Measure uses the same selected family and rasterizer as the displayed text.
// A bounded scratch raster avoids mixing Viva's system metrics with custom fonts.
func Measure(text, family string, size, weight float32) float32 {
	if text == "" {
		return 0
	}
	if width := nativeMeasure(text, family, size, weight); width > 0 {
		return width
	}
	b := Render(text, family, size, weight, 4096, 128, ui.Color{Alpha: 1})
	if b.Width == 0 {
		return 0
	}
	last := 0
	for y := 0; y < b.Height; y++ {
		for x := b.Width - 1; x >= last; x-- {
			if b.Pix[y*b.Stride+x*4+3] > 0 {
				last = x + 1
				break
			}
		}
	}
	return float32(last)/2 + 2
}
