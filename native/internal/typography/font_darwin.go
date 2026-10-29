//go:build darwin && cgo

package typography

/*
#cgo CFLAGS: -x objective-c -fobjc-arc
#cgo LDFLAGS: -framework CoreText -framework CoreGraphics -framework Foundation
#include <stdlib.h>
char *hm_font_families(void);
double hm_font_measure(const char*,const char*,double,double);
void *hm_font_draw(const char*,const char*,double,double,int,int,float,float,float,float);
*/
import "C"

import (
	"github.com/vivaui/viva/ui"
	"strings"
	"unsafe"
)

func DefaultFamily() string { return "PingFang SC" }

func Families() []string {
	raw := C.hm_font_families()
	if raw == nil {
		return nil
	}
	defer C.free(unsafe.Pointer(raw))
	return strings.Split(C.GoString(raw), "\n")
}
func Render(text, family string, size, weight float32, width, height int, tint ui.Color) ui.Bitmap {
	if width < 1 || height < 1 || width > 4096 || height > 512 {
		return ui.Bitmap{}
	}
	t, f := C.CString(text), C.CString(family)
	defer C.free(unsafe.Pointer(t))
	defer C.free(unsafe.Pointer(f))
	p := C.hm_font_draw(t, f, C.double(size), C.double(weight), C.int(width), C.int(height), C.float(tint.Red), C.float(tint.Green), C.float(tint.Blue), C.float(tint.Alpha))
	if p == nil {
		return ui.Bitmap{}
	}
	defer C.free(p)
	return ui.Bitmap{Pix: C.GoBytes(p, C.int(width*height*4)), Width: width, Height: height, Stride: width * 4, Version: 1}
}

func nativeMeasure(text, family string, size, weight float32) float32 {
	t, f := C.CString(text), C.CString(family)
	defer C.free(unsafe.Pointer(t))
	defer C.free(unsafe.Pointer(f))
	return float32(C.hm_font_measure(t, f, C.double(size), C.double(weight)))
}
