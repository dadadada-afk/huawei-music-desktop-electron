package main

import (
	"testing"

	"github.com/vivaui/viva/app"
	"github.com/vivaui/viva/ui"
)

func TestProbeDisclosesMissingCapabilities(t *testing.T) {
	var canvas ui.Canvas
	driver, err := app.NewDriver(config(&model{}), &canvas)
	if err != nil {
		t.Fatal(err)
	}
	defer driver.Close()
	for _, hit := range driver.Snapshot().Hits {
		if hit.ID == detailsID {
			if err := driver.Click(hit.Bounds.X+hit.Bounds.Width/2, hit.Bounds.Y+hit.Bounds.Height/2); err != nil {
				t.Fatal(err)
			}
			for _, label := range driver.Snapshot().Labels {
				if label.Value == "没有读取私人会话，也没有发起华为业务请求。" {
					return
				}
			}
			t.Fatal("disclosure was not shown after clicking")
		}
	}
	t.Fatal("missing disclosure control")
}

func BenchmarkProbePaint(b *testing.B) {
	var canvas ui.Canvas
	cfg := config(&model{})
	size := ui.Size{Width: 1180, Height: 760}
	cfg.Paint(&canvas, size)
	b.ReportAllocs()
	b.ResetTimer()
	for b.Loop() {
		canvas.Reset()
		cfg.Paint(&canvas, size)
	}
}
