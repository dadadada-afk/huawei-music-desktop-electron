#import <MediaPlayer/MediaPlayer.h>
#import <Foundation/Foundation.h>
#include <stdint.h>

extern void hm_media_command(uintptr_t,int,double);
@interface HMMedia : NSObject
@property(nonatomic) uintptr_t handle;
@property(nonatomic) BOOL closed;
@property(nonatomic,strong) NSMutableArray *commands;
@property(nonatomic,strong) NSMutableArray *targets;
@end
@implementation HMMedia
@end
void *hm_media_init(uintptr_t handle){
    HMMedia *owner=[HMMedia new];owner.handle=handle;owner.commands=[NSMutableArray new];owner.targets=[NSMutableArray new];
    MPRemoteCommandCenter *center=MPRemoteCommandCenter.sharedCommandCenter;
    NSArray *commands=@[center.togglePlayPauseCommand,center.playCommand,center.pauseCommand,center.previousTrackCommand,center.nextTrackCommand,center.changePlaybackPositionCommand];
    [commands enumerateObjectsUsingBlock:^(MPRemoteCommand *command,NSUInteger index,BOOL *stop){
        command.enabled=YES;
        id target=[command addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent *event){
            double position=0;if([event isKindOfClass:MPChangePlaybackPositionCommandEvent.class])position=((MPChangePlaybackPositionCommandEvent *)event).positionTime;
            dispatch_async(dispatch_get_main_queue(),^{if(!owner.closed)hm_media_command(owner.handle,(int)index,position);});
            return MPRemoteCommandHandlerStatusSuccess;
        }];
        [owner.commands addObject:command];[owner.targets addObject:target];
    }];
    return (__bridge_retained void *)owner;
}
void hm_media_update(const char *title,const char *artist,double duration,double position,int playing){
    MPNowPlayingInfoCenter *center=MPNowPlayingInfoCenter.defaultCenter;
    center.nowPlayingInfo=@{MPMediaItemPropertyTitle:[NSString stringWithUTF8String:title],MPMediaItemPropertyArtist:[NSString stringWithUTF8String:artist],MPMediaItemPropertyPlaybackDuration:@(duration),MPNowPlayingInfoPropertyElapsedPlaybackTime:@(position),MPNowPlayingInfoPropertyPlaybackRate:@(playing?1:0)};
    center.playbackState=playing?MPNowPlayingPlaybackStatePlaying:MPNowPlayingPlaybackStatePaused;
}
void hm_media_close(void *raw){
    HMMedia *owner=(__bridge_transfer HMMedia *)raw;owner.closed=YES;
    for(NSUInteger i=0;i<owner.commands.count;i++)[(MPRemoteCommand *)owner.commands[i] removeTarget:owner.targets[i]];
    [owner.targets removeAllObjects];[owner.commands removeAllObjects];MPNowPlayingInfoCenter.defaultCenter.nowPlayingInfo=nil;
}
