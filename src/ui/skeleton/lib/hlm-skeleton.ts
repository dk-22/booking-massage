import { Directive } from '@angular/core';
import { classes } from '@spartan-ng/helm/utils';

@Directive({
	selector: '[hlmSkeleton],hlm-skeleton',
	exportAs: 'hlmSkeleton',
	host: {
		'data-slot': 'skeleton',
	},
})
export class HlmSkeleton {
	constructor() {
		classes(() => 'bg-border rounded-md block motion-safe:animate-pulse [animation-duration:1.2s]');
	}
}
