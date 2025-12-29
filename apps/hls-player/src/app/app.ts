import { Component, OnDestroy, ViewChild, ElementRef, afterNextRender } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Hls from 'hls.js';

interface QualityLevel {
  height: number;
  bitrate: number;
  name: string;
  index: number;
}

interface AudioTrack {
  id: number;
  name: string;
  lang: string;
  isDefault: boolean;
}

@Component({
  imports: [RouterModule, CommonModule, FormsModule],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnDestroy {
  @ViewChild('videoElement', { static: true }) videoElement!: ElementRef<HTMLVideoElement>;
  
  protected title = 'HLS Video Player';
  
  private hls: Hls | null = null;
  
  // Video source URL (example HLS stream)
  videoUrl = 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8';
  
  // Available quality levels
  qualityLevels: QualityLevel[] = [];
  selectedQuality = -1; // -1 for auto
  
  // Available audio tracks
  audioTracks: AudioTrack[] = [];
  selectedAudioTrack = -1;
  
  // Player state
  isPlaying = false;
  currentTime = 0;
  duration = 0;
  volume = 1;
  isMuted = false;
  isFullscreen = false;
  
  // Loading states
  isLoading = true;
  hasError = false;
  errorMessage = '';

  constructor() {
    afterNextRender(() => {
      this.initializePlayer();
    });
  }



  ngOnDestroy() {
    this.destroyPlayer();
  }

  private initializePlayer() {
    if (!this.videoElement?.nativeElement) return;

    const video = this.videoElement.nativeElement;
    
    if (Hls.isSupported()) {
      this.hls = new Hls({
        enableWorker: false,
      });
      
      this.hls.loadSource(this.videoUrl);
      this.hls.attachMedia(video);
      
      this.setupHlsEvents();
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      video.src = this.videoUrl;
      this.isLoading = false;
    } else {
      this.hasError = true;
      this.errorMessage = 'HLS is not supported in this browser';
      this.isLoading = false;
    }
    
    this.setupVideoEvents();
  }

  private setupHlsEvents() {
    if (!this.hls) return;

    this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
      this.isLoading = false;
      this.updateQualityLevels();
      this.updateAudioTracks();
    });

    this.hls.on(Hls.Events.LEVEL_LOADED, () => {
      this.updateQualityLevels();
    });

    this.hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
      this.updateAudioTracks();
    });

    this.hls.on(Hls.Events.ERROR, (event, data) => {
      console.error('HLS Error:', data);
      if (data.fatal) {
        this.hasError = true;
        this.errorMessage = `HLS Error: ${data.details}`;
        this.isLoading = false;
      }
    });
  }

  private setupVideoEvents() {
    const video = this.videoElement.nativeElement;
    
    video.addEventListener('loadedmetadata', () => {
      this.duration = video.duration;
    });
    
    video.addEventListener('timeupdate', () => {
      this.currentTime = video.currentTime;
    });
    
    video.addEventListener('play', () => {
      this.isPlaying = true;
    });
    
    video.addEventListener('pause', () => {
      this.isPlaying = false;
    });
    
    video.addEventListener('volumechange', () => {
      this.volume = video.volume;
      this.isMuted = video.muted;
    });
  }

  private updateQualityLevels() {
    if (!this.hls) return;
    
    this.qualityLevels = this.hls.levels.map((level, index) => ({
      height: level.height,
      bitrate: level.bitrate,
      name: `${level.height}p (${Math.round(level.bitrate / 1000)}kbps)`,
      index
    }));
  }

  private updateAudioTracks() {
    if (!this.hls) return;
    
    this.audioTracks = this.hls.audioTracks.map((track, index) => ({
      id: index,
      name: track.name || `Track ${index + 1}`,
      lang: track.lang || 'unknown',
      isDefault: track.default || false
    }));
    
    // Set default audio track
    const defaultTrack = this.audioTracks.find(track => track.isDefault);
    if (defaultTrack) {
      this.selectedAudioTrack = defaultTrack.id;
    }
  }

  private destroyPlayer() {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
  }

  // Player controls
  togglePlay() {
    const video = this.videoElement.nativeElement;
    if (this.isPlaying) {
      video.pause();
    } else {
      video.play();
    }
  }

  onQualityChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const qualityIndex = parseInt(select.value);
    
    if (this.hls) {
      this.hls.currentLevel = qualityIndex;
      this.selectedQuality = qualityIndex;
    }
  }

  onAudioTrackChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const trackId = parseInt(select.value);
    
    if (this.hls) {
      this.hls.audioTrack = trackId;
      this.selectedAudioTrack = trackId;
    }
  }

  onSeek(event: Event) {
    const input = event.target as HTMLInputElement;
    const time = parseFloat(input.value);
    this.videoElement.nativeElement.currentTime = time;
  }

  onVolumeChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const volume = parseFloat(input.value);
    this.videoElement.nativeElement.volume = volume;
  }

  toggleMute() {
    const video = this.videoElement.nativeElement;
    video.muted = !video.muted;
  }

  toggleFullscreen() {
    const video = this.videoElement.nativeElement;
    
    if (!document.fullscreenElement) {
      video.requestFullscreen().then(() => {
        this.isFullscreen = true;
      });
    } else {
      document.exitFullscreen().then(() => {
        this.isFullscreen = false;
      });
    }
  }

  formatTime(time: number): string {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  changeVideoUrl(url: string) {
    this.videoUrl = url;
    this.isLoading = true;
    this.hasError = false;
    this.errorMessage = '';
    
    if (this.hls) {
      this.hls.loadSource(url);
    } else if (this.videoElement.nativeElement.canPlayType('application/vnd.apple.mpegurl')) {
      this.videoElement.nativeElement.src = url;
    }
  }
}
