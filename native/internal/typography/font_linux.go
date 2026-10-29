//go:build linux

package typography

import (
	"context"
	"os/exec"
	"sort"
	"strings"
	"sync"
	"time"
	"unsafe"

	"github.com/ebitengine/purego"
	"github.com/vivaui/viva/ui"
)

func DefaultFamily() string { return "sans-serif" }
func Families() []string {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	data, err := exec.CommandContext(ctx, "fc-list", "--format=%{family}\\n").Output()
	if err != nil || len(data) > 4*1024*1024 {
		return nil
	}
	seen := map[string]bool{}
	for _, line := range strings.Split(string(data), "\n") {
		for _, name := range strings.Split(line, ",") {
			if name = strings.TrimSpace(name); name != "" {
				seen[name] = true
			}
		}
	}
	result := make([]string, 0, len(seen))
	for name := range seen {
		result = append(result, name)
	}
	sort.Strings(result)
	return result
}

type pangoAPI struct {
	mu                                              sync.Mutex
	surface                                         func(unsafe.Pointer, int32, int32, int32, int32) uintptr
	create                                          func(uintptr) uintptr
	destroy, surfaceDestroy, flush, unref, fontFree func(uintptr)
	newLayout                                       func(uintptr) uintptr
	setText                                         func(uintptr, string, int32)
	fontNew                                         func() uintptr
	fontFamily                                      func(uintptr, string)
	fontSize                                        func(uintptr, float64)
	fontWeight, setWidth, setEllipsis, setParagraph func(uintptr, int32)
	setFont                                         func(uintptr, uintptr)
	getSize                                         func(uintptr, *int32, *int32)
	color                                           func(uintptr, float64, float64, float64, float64)
	move                                            func(uintptr, float64, float64)
	show                                            func(uintptr, uintptr)
}

var linuxFonts struct {
	once sync.Once
	api  *pangoAPI
}

func loadPango() {
	// The handles stay open for the lifetime of the process, as do Viva's text services.
	libs := map[string]uintptr{}
	for _, name := range []string{"libcairo.so.2", "libpango-1.0.so.0", "libpangocairo-1.0.so.0", "libgobject-2.0.so.0"} {
		h, err := purego.Dlopen(name, purego.RTLD_NOW|purego.RTLD_LOCAL)
		if err != nil {
			return
		}
		libs[name] = h
	}
	a := &pangoAPI{}
	for _, entry := range []struct {
		dst       any
		lib, name string
	}{
		{&a.surface, "libcairo.so.2", "cairo_image_surface_create_for_data"}, {&a.create, "libcairo.so.2", "cairo_create"},
		{&a.destroy, "libcairo.so.2", "cairo_destroy"}, {&a.surfaceDestroy, "libcairo.so.2", "cairo_surface_destroy"}, {&a.flush, "libcairo.so.2", "cairo_surface_flush"},
		{&a.color, "libcairo.so.2", "cairo_set_source_rgba"}, {&a.move, "libcairo.so.2", "cairo_move_to"},
		{&a.newLayout, "libpangocairo-1.0.so.0", "pango_cairo_create_layout"}, {&a.show, "libpangocairo-1.0.so.0", "pango_cairo_show_layout"},
		{&a.setText, "libpango-1.0.so.0", "pango_layout_set_text"}, {&a.fontNew, "libpango-1.0.so.0", "pango_font_description_new"},
		{&a.fontFree, "libpango-1.0.so.0", "pango_font_description_free"}, {&a.fontFamily, "libpango-1.0.so.0", "pango_font_description_set_family"},
		{&a.fontSize, "libpango-1.0.so.0", "pango_font_description_set_absolute_size"}, {&a.fontWeight, "libpango-1.0.so.0", "pango_font_description_set_weight"},
		{&a.setFont, "libpango-1.0.so.0", "pango_layout_set_font_description"}, {&a.setWidth, "libpango-1.0.so.0", "pango_layout_set_width"},
		{&a.setEllipsis, "libpango-1.0.so.0", "pango_layout_set_ellipsize"}, {&a.setParagraph, "libpango-1.0.so.0", "pango_layout_set_single_paragraph_mode"},
		{&a.getSize, "libpango-1.0.so.0", "pango_layout_get_pixel_size"}, {&a.unref, "libgobject-2.0.so.0", "g_object_unref"},
	} {
		symbol, err := purego.Dlsym(libs[entry.lib], entry.name)
		if err != nil {
			return
		}
		purego.RegisterFunc(entry.dst, symbol)
	}
	linuxFonts.api = a
}
func Render(text, family string, size, weight float32, width, height int, tint ui.Color) ui.Bitmap {
	if width < 1 || height < 1 || width > 4096 || height > 512 {
		return ui.Bitmap{}
	}
	linuxFonts.once.Do(loadPango)
	a := linuxFonts.api
	if a == nil {
		return ui.Bitmap{}
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	pix := make([]byte, width*height*4)
	surface := a.surface(unsafe.Pointer(&pix[0]), 0, int32(width), int32(height), int32(width*4))
	if surface == 0 {
		return ui.Bitmap{}
	}
	defer a.surfaceDestroy(surface)
	cr := a.create(surface)
	if cr == 0 {
		return ui.Bitmap{}
	}
	defer a.destroy(cr)
	layout := a.newLayout(cr)
	if layout == 0 {
		return ui.Bitmap{}
	}
	defer a.unref(layout)
	font := a.fontNew()
	if font == 0 {
		return ui.Bitmap{}
	}
	defer a.fontFree(font)
	a.fontFamily(font, family)
	a.fontSize(font, float64(size)*2*1024)
	w := int32(400)
	if weight >= ui.WeightMedium {
		w = 500
	}
	if weight >= ui.WeightSemibold {
		w = 600
	}
	if weight >= ui.WeightBold {
		w = 700
	}
	a.fontWeight(font, w)
	a.setFont(layout, font)
	a.setText(layout, text, int32(len(text)))
	a.setWidth(layout, int32(width)*1024)
	a.setEllipsis(layout, 3)
	a.setParagraph(layout, 1)
	var tw, th int32
	a.getSize(layout, &tw, &th)
	a.color(cr, float64(tint.Red), float64(tint.Green), float64(tint.Blue), float64(tint.Alpha))
	a.move(cr, 0, float64(height-int(th))/2)
	a.show(cr, layout)
	a.flush(surface)
	// Cairo retains the Go-backed buffer until the surface is destroyed.
	return ui.Bitmap{Pix: pix, Width: width, Height: height, Stride: width * 4, Version: 1}
}
