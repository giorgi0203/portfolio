import { Component, input } from '@angular/core';
import { explainWait, type StreamDoctor } from './stream-doctor';

@Component({
  selector:'app-stream-doctor',
  templateUrl:'./stream-doctor.component.html',
  styleUrl:'./stream-doctor.component.css',
})
export class StreamDoctorComponent {
  doctor = input.required<StreamDoctor>();
  private chosen: {session:StreamDoctor; id:number} | null = null;
  explain = explainWait;
  select(id: number) { this.chosen = {session:this.doctor(), id}; }
  get selected() {
    const session = this.doctor();
    return (this.chosen?.session === session && session.waits.find(wait=>wait.id===this.chosen?.id)) || session.waits[0] || null;
  }
  get scale() { return Math.max(1, ...this.doctor().buffer.map(sample=>sample.seconds)); }
  time(seconds: number) {
    const whole = Math.floor(seconds);
    return Math.floor(whole/60) + ':' + String(whole%60).padStart(2,'0') + '.' + Math.floor((seconds-whole)*10);
  }
}
