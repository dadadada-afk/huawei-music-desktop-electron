#import <Foundation/Foundation.h>
#import <CoreText/CoreText.h>
#import <CoreGraphics/CoreGraphics.h>
#include <stdlib.h>
#include <string.h>

char *hm_font_families(void){
    NSArray *families=CFBridgingRelease(CTFontManagerCopyAvailableFontFamilyNames());
    return strdup([[families sortedArrayUsingSelector:@selector(localizedCaseInsensitiveCompare:)] componentsJoinedByString:@"\n"].UTF8String);
}
void *hm_font_draw(const char *text,const char *family,double size,double weight,int width,int height,float red,float green,float blue,float alpha){
    @autoreleasepool {
        void *pixels=calloc((size_t)width*height,4);if(!pixels)return NULL;
        CGColorSpaceRef space=CGColorSpaceCreateDeviceRGB();
        CGContextRef ctx=CGBitmapContextCreate(pixels,width,height,8,width*4,space,kCGImageAlphaPremultipliedFirst|kCGBitmapByteOrder32Little);CGColorSpaceRelease(space);
        if(!ctx){free(pixels);return NULL;}
        NSString *name=[NSString stringWithUTF8String:family];
        CTFontDescriptorRef descriptor=CTFontDescriptorCreateWithAttributes((__bridge CFDictionaryRef)@{(__bridge NSString *)kCTFontFamilyNameAttribute:name,(__bridge NSString *)kCTFontTraitsAttribute:@{(__bridge NSString *)kCTFontWeightTrait:@(weight)}});
        CTFontRef font=CTFontCreateWithFontDescriptor(descriptor,size*2,NULL);CFRelease(descriptor);
        CGColorRef color=CGColorCreateGenericRGB(red,green,blue,alpha);
        NSDictionary *attributes=@{(__bridge NSString *)kCTFontAttributeName:(__bridge id)font,(__bridge NSString *)kCTForegroundColorAttributeName:(__bridge id)color};
        NSAttributedString *string=[[NSAttributedString alloc]initWithString:[NSString stringWithUTF8String:text] attributes:attributes];
        CTLineRef line=CTLineCreateWithAttributedString((__bridge CFAttributedStringRef)string);
        CTLineRef visible=line;
        if(CTLineGetTypographicBounds(line,NULL,NULL,NULL)>width){
            NSAttributedString *ellipsis=[[NSAttributedString alloc]initWithString:@"…" attributes:attributes];
            CTLineRef token=CTLineCreateWithAttributedString((__bridge CFAttributedStringRef)ellipsis);
            CTLineRef truncated=CTLineCreateTruncatedLine(line,width,kCTLineTruncationEnd,token);CFRelease(token);if(truncated)visible=truncated;
        }
        CGFloat ascent=0,descent=0;CTLineGetTypographicBounds(visible,&ascent,&descent,NULL);
        CGContextSetTextPosition(ctx,0,(height-ascent-descent)/2+descent);CTLineDraw(visible,ctx);
        if(visible!=line)CFRelease(visible);CFRelease(line);CFRelease(font);CGColorRelease(color);CGContextRelease(ctx);return pixels;
    }
}

double hm_font_measure(const char *text,const char *family,double size,double weight){
    @autoreleasepool {
        CTFontDescriptorRef descriptor=CTFontDescriptorCreateWithAttributes((__bridge CFDictionaryRef)@{(__bridge NSString *)kCTFontFamilyNameAttribute:[NSString stringWithUTF8String:family],(__bridge NSString *)kCTFontTraitsAttribute:@{(__bridge NSString *)kCTFontWeightTrait:@(weight)}});
        CTFontRef font=CTFontCreateWithFontDescriptor(descriptor,size,NULL);CFRelease(descriptor);
        NSAttributedString *value=[[NSAttributedString alloc]initWithString:[NSString stringWithUTF8String:text] attributes:@{(__bridge NSString *)kCTFontAttributeName:(__bridge id)font}];
        CTLineRef line=CTLineCreateWithAttributedString((__bridge CFAttributedStringRef)value);
        double width=CTLineGetTypographicBounds(line,NULL,NULL,NULL);
        CFRelease(line);CFRelease(font);return width+2;
    }
}
