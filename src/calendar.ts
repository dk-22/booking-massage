/** Serialize a confirmed reservation as an RFC 5545 calendar event. */
export function bookingCalendar(event:{reference:string;campaign:string;start:string;end:string},now=new Date()):string {
 const escape=(value:string)=>value.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
 const localStamp=(value:string)=>new Date(new Date(value).getTime()+4*60*60*1000).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'');
 const stamp=(value:string|Date)=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
 // Fold at 75 UTF-8 octets without splitting a Unicode character.
 const fold=(value:string)=>{const lines:string[]=[];let line='',length=0;for(const char of value){const bytes=new TextEncoder().encode(char).length;if(length+bytes>75){lines.push(line);line=' ';length=1;}line+=char;length+=bytes;}lines.push(line);return lines.join('\r\n');};
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Pause//Employee Wellness//EN','CALSCALE:GREGORIAN','X-WR-TIMEZONE:Indian/Mauritius','BEGIN:VTIMEZONE','TZID:Indian/Mauritius','X-LIC-LOCATION:Indian/Mauritius','BEGIN:STANDARD','DTSTART:19700101T000000','TZOFFSETFROM:+0400','TZOFFSETTO:+0400','TZNAME:MUT','END:STANDARD','END:VTIMEZONE','BEGIN:VEVENT','UID:'+escape(event.reference+'@pause-booking'),'DTSTAMP:'+stamp(now),'DTSTART;TZID=Indian/Mauritius:'+localStamp(event.start),'DTEND;TZID=Indian/Mauritius:'+localStamp(event.end),'SUMMARY:'+escape('Massage · '+event.campaign),'DESCRIPTION:'+escape('Booking reference: '+event.reference+'\nFor changes or cancellation, contact your administrator.\nThis calendar event does not update automatically.'),'STATUS:CONFIRMED','TRANSP:OPAQUE','END:VEVENT','END:VCALENDAR'].map(fold).join('\r\n')+'\r\n';
}
