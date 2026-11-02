import { TestBed } from '@angular/core/testing';

import { ShelfZoom, ZOOM_STEPS, tileScaleFactor } from './shelf-zoom';

describe('ShelfZoom', () => {
  beforeEach(() => localStorage.removeItem('tapeshelf.shelfZoom'));

  it('starts as the shelf chose, steps within its bounds and is remembered in this browser', () => {
    const zoom = TestBed.inject(ShelfZoom);
    expect(zoom.factor()).toBe(1);
    zoom.zoomIn();
    zoom.zoomIn();
    zoom.zoomIn();
    expect(zoom.factor()).toBe(ZOOM_STEPS.at(-1));
    expect(zoom.canZoomIn()).toBe(false);
    expect(localStorage.getItem('tapeshelf.shelfZoom')).toBe(String(ZOOM_STEPS.length - 1));
    for (let i = 0; i < 10; i++) zoom.zoomOut();
    expect(zoom.factor()).toBe(ZOOM_STEPS[0]);
    expect(zoom.canZoomOut()).toBe(false);
  });

  it('takes the owner’s tile size as a factor on the same steps', () => {
    expect(tileScaleFactor('md')).toBe(1);
    expect(tileScaleFactor(null)).toBe(1);
    expect(tileScaleFactor('xs')).toBe(ZOOM_STEPS[0]);
    expect(tileScaleFactor('xl')).toBe(ZOOM_STEPS.at(-1));
  });
});
