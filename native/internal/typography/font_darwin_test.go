//go:build darwin && cgo

package typography

import (
	"github.com/vivaui/viva/ui"
	"testing"
)

func TestFontRasterKeepsAlphaAndBounds(t *testing.T) {
	if len(Families()) == 0 {
		t.Fatal("font enumeration empty")
	}
	b := Render("测试 Native", "PingFang SC", 14, .23, 240, 48, ui.Color{Red: 1, Alpha: 1})
	if len(b.Pix) != 240*48*4 {
		t.Fatal("wrong bitmap size")
	}
	visible := 0
	for i := 3; i < len(b.Pix); i += 4 {
		if b.Pix[i] > 0 {
			visible++
		}
	}
	if visible == 0 || visible == 240*48 {
		t.Fatal("text alpha missing")
	}
	if b := Render("x", "PingFang SC", 14, 0, 100000, 1000, ui.Color{}); len(b.Pix) > 0 {
		t.Fatal("unbounded allocation")
	}
}
