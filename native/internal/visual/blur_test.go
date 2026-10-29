package visual

import (
	"github.com/vivaui/viva/ui"
	"testing"
)

func TestBlurSpreadsAndRoundKeepsCenter(t *testing.T) {
	pix := make([]byte, 9*9*4)
	for i := 3; i < len(pix); i += 4 {
		pix[i] = 255
	}
	pix[(4*9+4)*4+2] = 255
	s := ui.Bitmap{Pix: pix, Width: 9, Height: 9, Stride: 36}
	b := Blur(s, 1, 1, 1)
	if b.Pix[(4*9+4)*4+2] >= 255 || b.Pix[(4*9+3)*4+2] == 0 || s.Pix[(4*9+4)*4+2] != 255 {
		t.Fatal("blur did not spread or modified source")
	}
	r := Round(b, 4)
	if r.Pix[3] != 0 || r.Pix[(4*9+4)*4+3] != 255 {
		t.Fatal("rounded alpha incorrect")
	}
}
