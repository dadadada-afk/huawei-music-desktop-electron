package visual

import "github.com/vivaui/viva/ui"

// Blur performs three separable box passes, approximating a Gaussian without
// retaining full-resolution copies. Call only when the background changes.
func Blur(source ui.Bitmap, radius int, saturation, brightness float64) ui.Bitmap {
	if source.Width <= 0 || source.Height <= 0 {
		return ui.Bitmap{}
	}
	w, h := source.Width, source.Height
	pix := append([]byte(nil), source.Pix...)
	scratch := make([]byte, len(pix))
	radius = max(1, min(128, radius))
	for range 3 {
		for y := 0; y < h; y++ {
			for channel := 0; channel < 4; channel++ {
				sum := 0
				for x := -radius; x <= radius; x++ {
					sum += int(pix[y*source.Stride+max(0, min(w-1, x))*4+channel])
				}
				for x := 0; x < w; x++ {
					scratch[y*source.Stride+x*4+channel] = byte(sum / (2*radius + 1))
					sum -= int(pix[y*source.Stride+max(0, x-radius)*4+channel])
					sum += int(pix[y*source.Stride+min(w-1, x+radius+1)*4+channel])
				}
			}
		}
		for x := 0; x < w; x++ {
			for channel := 0; channel < 4; channel++ {
				sum := 0
				for y := -radius; y <= radius; y++ {
					sum += int(scratch[max(0, min(h-1, y))*source.Stride+x*4+channel])
				}
				for y := 0; y < h; y++ {
					pix[y*source.Stride+x*4+channel] = byte(sum / (2*radius + 1))
					sum -= int(scratch[max(0, y-radius)*source.Stride+x*4+channel])
					sum += int(scratch[min(h-1, y+radius+1)*source.Stride+x*4+channel])
				}
			}
		}
	}
	for i := 0; i < len(pix); i += 4 {
		grey := .0722*float64(pix[i]) + .7152*float64(pix[i+1]) + .2126*float64(pix[i+2])
		for c := 0; c < 3; c++ {
			pix[i+c] = byte(max(0, min(255, (grey+(float64(pix[i+c])-grey)*saturation)*brightness)))
		}
	}
	return ui.Bitmap{Pix: pix, Width: w, Height: h, Stride: source.Stride, Version: 1}
}

func Round(source ui.Bitmap, radius float64) ui.Bitmap {
	if source.Width <= 0 || source.Height <= 0 {
		return source
	}
	pix := append([]byte(nil), source.Pix...)
	r := min(radius, float64(min(source.Width, source.Height))/2)
	for y := 0; y < source.Height; y++ {
		for x := 0; x < source.Width; x++ {
			dx := max(0, r-float64(x)-.5, float64(x)+.5-float64(source.Width)+r)
			dy := max(0, r-float64(y)-.5, float64(y)+.5-float64(source.Height)+r)
			if dx*dx+dy*dy > r*r {
				at := y*source.Stride + x*4
				clear(pix[at : at+4])
			}
		}
	}
	source.Pix = pix
	return source
}
