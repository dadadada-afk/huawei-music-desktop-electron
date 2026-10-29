package visual

import (
	"github.com/vivaui/viva/ui"
	"testing"
)

func TestBackdropChangesWithUnderlyingContent(t *testing.T) {
	var c ui.Canvas
	b := ui.Rect{Width: 80, Height: 80}
	c.Fill(b, ui.Color{Blue: 1, Alpha: 1})
	key := BackdropKey(&c, b, 8, .6)
	a, _ := Backdrop(&c, b, 8, 8, 0)
	c.Fill(ui.Rect{X: 30, Y: 30, Width: 20, Height: 20}, ui.Color{Red: 1, Alpha: 1})
	other := BackdropKey(&c, b, 8, .6)
	z, _ := Backdrop(&c, b, 8, 8, 0)
	if key == other || a.Width != 20 || z.Pix[(10*20+10)*4+2] == 0 || z.Pix[3] != 0 {
		t.Fatal("backdrop failed to include content or rounded alpha")
	}
}

func TestBackdropRespectsLayersAndGeometryOrder(t *testing.T) {
	var c ui.Canvas
	b := ui.Rect{Width: 80, Height: 80}
	c.Fill(b, ui.Color{Red: 1, Alpha: 1})
	RoundedGradient(&c, b, 0, ui.Color{Green: 1, Alpha: 1}, ui.Color{Green: 1, Alpha: 1})
	c.Fill(b, ui.Color{Blue: 1, Alpha: 1})
	im, _ := Backdrop(&c, b, 1, 0, 0)
	at := (10*20 + 10) * 4
	if im.Pix[at] < 240 || im.Pix[at+1] > 20 {
		t.Fatal("triangle drawn over later rectangle")
	}
	c.PushLayer(2)
	c.Fill(b, ui.Color{Red: 1, Alpha: 1})
	c.PopLayer()
	c.Fill(b, ui.Color{Blue: 1, Alpha: 1})
	im, _ = Backdrop(&c, b, 1, 0, 0)
	if im.Pix[at+2] < 240 {
		t.Fatal("higher layer lost")
	}
}
