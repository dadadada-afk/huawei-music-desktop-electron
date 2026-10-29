// Compare same-size synthetic screenshots without hiding account-state or font differences.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"math"
	"os"
)

func load(path string) image.Image {
	f, err := os.Open(path)
	if err != nil {
		panic(err)
	}
	defer f.Close()
	im, err := png.Decode(f)
	if err != nil {
		panic(err)
	}
	return im
}

func main() {
	reference := flag.String("reference", "", "reference PNG")
	candidate := flag.String("candidate", "", "candidate PNG")
	output := flag.String("output", "diff.png", "absolute RGB difference PNG")
	threshold := flag.Int("threshold", 16, "per-channel difference threshold, 0..255")
	flag.Parse()
	if *threshold < 0 || *threshold > 255 {
		panic("invalid threshold")
	}
	a, b := load(*reference), load(*candidate)
	if a.Bounds() != b.Bounds() {
		panic("image dimensions differ; capture at matching scale")
	}
	diff := image.NewNRGBA(a.Bounds())
	var total float64
	var changed, maxDelta int
	for y := a.Bounds().Min.Y; y < a.Bounds().Max.Y; y++ {
		for x := a.Bounds().Min.X; x < a.Bounds().Max.X; x++ {
			ac := color.NRGBAModel.Convert(a.At(x, y)).(color.NRGBA)
			bc := color.NRGBAModel.Convert(b.At(x, y)).(color.NRGBA)
			r, g, bl := int(math.Abs(float64(ac.R)-float64(bc.R))), int(math.Abs(float64(ac.G)-float64(bc.G))), int(math.Abs(float64(ac.B)-float64(bc.B)))
			delta := max(r, g, bl)
			maxDelta = max(maxDelta, delta)
			total += float64(r + g + bl)
			if delta > *threshold {
				changed++
			}
			diff.SetNRGBA(x, y, color.NRGBA{uint8(r), uint8(g), uint8(bl), 255})
		}
	}
	f, err := os.Create(*output)
	if err != nil {
		panic(err)
	}
	if err = png.Encode(f, diff); err != nil {
		panic(err)
	}
	if err = f.Close(); err != nil {
		panic(err)
	}
	pixels := a.Bounds().Dx() * a.Bounds().Dy()
	report := struct {
		Reference, Candidate                          string
		Width, Height, Threshold, MaxChannelDelta     int
		MeanAbsoluteChannelError, ChangedPixelPercent float64
		ExactMatch                                    bool
	}{*reference, *candidate, a.Bounds().Dx(), a.Bounds().Dy(), *threshold, maxDelta, total / float64(pixels*3), 100 * float64(changed) / float64(pixels), maxDelta == 0}
	data, _ := json.MarshalIndent(report, "", "  ")
	fmt.Println(string(data))
}
