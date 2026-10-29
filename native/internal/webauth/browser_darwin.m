#import <Cocoa/Cocoa.h>
#import <AuthenticationServices/AuthenticationServices.h>
#include <stdint.h>

extern void hm_auth_complete(uintptr_t handle, const char *url, int status);

@interface HMAuthorization : NSObject <ASWebAuthenticationPresentationContextProviding>
@property(nonatomic, strong) ASWebAuthenticationSession *session;
@property(nonatomic, strong) NSWindow *anchor;
@property(nonatomic) uintptr_t handle;
@property(nonatomic) BOOL finished;
@end

@implementation HMAuthorization
- (ASPresentationAnchor)presentationAnchorForWebAuthenticationSession:(ASWebAuthenticationSession *)session {
    return self.anchor;
}
- (void)finish:(NSURL *)url status:(int)status {
    if (self.finished) return;
    self.finished = YES;
    hm_auth_complete(self.handle, url.absoluteString.UTF8String, status);
}
@end

static void on_main(void (^operation)(void)) {
    if ([NSThread isMainThread]) operation();
    else dispatch_sync(dispatch_get_main_queue(), operation);
}

void *hm_auth_start(const char *raw, uintptr_t handle) {
    NSString *value = [NSString stringWithUTF8String:raw];
    __block HMAuthorization *owner;
    on_main(^{
        owner = [HMAuthorization new];
        owner.handle = handle;
        owner.anchor = NSApp.keyWindow;
        if (!owner.anchor) {
            [owner finish:nil status:2];
            return;
        }
        __weak HMAuthorization *weakOwner = owner;
        owner.session = [[ASWebAuthenticationSession alloc]
            initWithURL:[NSURL URLWithString:value]
            callbackURLScheme:@"hms"
            completionHandler:^(NSURL *url, NSError *error) {
                on_main(^{ [weakOwner finish:url status:error ? 1 : 0]; });
            }];
        owner.session.presentationContextProvider = owner;
        owner.session.prefersEphemeralWebBrowserSession = YES;
        if (![owner.session start]) [owner finish:nil status:2];
    });
    return (__bridge_retained void *)owner;
}

void hm_auth_close(void *raw) {
    if (!raw) return;
    HMAuthorization *owner = (__bridge_transfer HMAuthorization *)raw;
    on_main(^{
        [owner.session cancel];
        [owner finish:nil status:1];
        owner.session = nil;
        owner.anchor = nil;
    });
}
