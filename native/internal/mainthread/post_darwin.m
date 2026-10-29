//go:build darwin && cgo
#import <Foundation/Foundation.h>
#include <stdint.h>
extern void hm_run_main(uintptr_t);
void hm_post_main(uintptr_t handle) {
 dispatch_async(dispatch_get_main_queue(), ^{ hm_run_main(handle); });
}
