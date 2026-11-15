import type { LevelDef } from '../game/types';

/**
 * Level 1 — "Move-in day".
 *
 * ── This is the only file you need to edit to change the room layout,
 *    item placements, destination zones and slot anchors. ──
 *
 * Coordinate system (see src/game/types.ts): the origin is the back corner.
 * +x runs along the right-hand wall, +y along the left-hand wall, z is up.
 * Room is 10 × 8 units; walls sit at x = 0 and y = 0; the front corner
 * (10, 8) is the open cutaway the camera looks into.
 *
 * Layout:
 *   · left wall (x = 0):  bookshelf, plant, sofa (+ window above), bench
 *   · right wall (y = 0): linen shelf, wall art, kitchen counter + mug rack
 *   · floor: rug, open moving box, entry mat by the bench (front-left)
 *
 * To add an item: append an entry to `items` and, if its zone has no free
 * slot left, add a slot to the matching zone below. To add a whole new zone
 * or piece of furniture, add it here and (if needed) draw its asset in
 * src/view/assets.ts. Nothing else needs to change.
 */
export const houseLevel: LevelDef = {
  id: 'house-1',
  name: 'Move-in day',
  room: { width: 10, depth: 8, wallHeight: 2.9 },

  furniture: [
    { id: 'rug', asset: 'rug', anchor: { x: 4.9, y: 4.0, z: 0 }, flat: true },
    { id: 'entryMat', asset: 'entryMat', anchor: { x: 1.6, y: 6.95, z: 0 }, flat: true },
    { id: 'bookshelf', asset: 'bookshelf', anchor: { x: 0.3, y: 1.9, z: 0 }, sortBias: -0.5 },
    { id: 'plantCorner', asset: 'plant', anchor: { x: 0.52, y: 2.98, z: 0 } },
    { id: 'sofa', asset: 'sofa', anchor: { x: 0.62, y: 4.15, z: 0 }, sortBias: -0.55 },
    { id: 'windowLeft', asset: 'windowLeft', anchor: { x: 0, y: 5.75, z: 0 } },
    { id: 'bench', asset: 'bench', anchor: { x: 0.32, y: 6.9, z: 0 } },
    { id: 'linenShelf', asset: 'linenShelf', anchor: { x: 3.4, y: 0.32, z: 0 }, sortBias: -0.5 },
    { id: 'artFrame', asset: 'artFrame', anchor: { x: 5.1, y: 0.02, z: 0 } },
    { id: 'mugRack', asset: 'mugRack', anchor: { x: 7.5, y: 0.1, z: 0 }, sortBias: -0.5 },
    { id: 'kitchenCounter', asset: 'kitchenCounter', anchor: { x: 7.8, y: 0.36, z: 0 } },
    { id: 'stool', asset: 'stool', anchor: { x: 5.75, y: 1.1, z: 0 } },
    { id: 'spillBox', asset: 'spillBox', anchor: { x: 4.3, y: 4.1, z: 0 } },
  ],

  zones: [
    {
      id: 'zoneBookshelf',
      label: 'Bookshelf',
      category: 'book',
      slots: [
        { id: 'bs1', zoneId: 'zoneBookshelf', anchor: { x: 0.3, y: 1.5, z: 0.68 } },
        { id: 'bs2', zoneId: 'zoneBookshelf', anchor: { x: 0.3, y: 1.78, z: 0.68 } },
        { id: 'bs3', zoneId: 'zoneBookshelf', anchor: { x: 0.3, y: 2.06, z: 0.68 } },
      ],
      labelAnchor: { x: 0.5, y: 1.9, z: 2.55 },
    },
    {
      id: 'zoneRack',
      label: 'Kitchen rack',
      category: 'mug',
      slots: [
        { id: 'rk1', zoneId: 'zoneRack', anchor: { x: 6.9, y: 0.16, z: 1.46 } },
        { id: 'rk2', zoneId: 'zoneRack', anchor: { x: 7.5, y: 0.16, z: 1.46 } },
        { id: 'rk3', zoneId: 'zoneRack', anchor: { x: 8.1, y: 0.16, z: 1.46 } },
      ],
      labelAnchor: { x: 7.5, y: 0.4, z: 2.0 },
    },
    {
      id: 'zoneSofa',
      label: 'Sofa',
      category: 'cushion',
      slots: [
        { id: 'sf1', zoneId: 'zoneSofa', anchor: { x: 0.75, y: 3.92, z: 0.55 } },
        { id: 'sf2', zoneId: 'zoneSofa', anchor: { x: 0.75, y: 4.42, z: 0.55 } },
      ],
      labelAnchor: { x: 0.8, y: 4.15, z: 1.55 },
    },
    {
      id: 'zoneMat',
      label: 'Entry mat',
      category: 'shoe',
      slots: [
        { id: 'mt1', zoneId: 'zoneMat', anchor: { x: 1.42, y: 6.78, z: 0.04 } },
        { id: 'mt2', zoneId: 'zoneMat', anchor: { x: 1.78, y: 7.12, z: 0.04 } },
      ],
      labelAnchor: { x: 1.9, y: 6.6, z: 0.8 },
    },
    {
      id: 'zoneLinen',
      label: 'Linen shelf',
      category: 'towel',
      slots: [
        { id: 'ls1', zoneId: 'zoneLinen', anchor: { x: 3.15, y: 0.3, z: 0.91 } },
        { id: 'ls2', zoneId: 'zoneLinen', anchor: { x: 3.62, y: 0.3, z: 0.91 } },
      ],
      labelAnchor: { x: 3.4, y: 0.4, z: 1.85 },
    },
  ],

  items: [
    // 3 books → bookshelf
    { id: 'book-a', category: 'book', asset: 'book', variant: 0, start: { x: 5.0, y: 3.3 }, startRotation: -14 },
    { id: 'book-b', category: 'book', asset: 'book', variant: 1, start: { x: 3.6, y: 4.9 }, startRotation: 9 },
    { id: 'book-c', category: 'book', asset: 'book', variant: 2, start: { x: 6.2, y: 4.7 }, startRotation: 21 },
    // 3 mugs → kitchen rack
    { id: 'mug-a', category: 'mug', asset: 'mug', variant: 0, start: { x: 6.7, y: 5.9 } },
    { id: 'mug-b', category: 'mug', asset: 'mug', variant: 1, start: { x: 4.4, y: 2.5 } },
    { id: 'mug-c', category: 'mug', asset: 'mug', variant: 2, start: { x: 7.6, y: 3.4 } },
    // 2 cushions → sofa
    { id: 'cushion-a', category: 'cushion', asset: 'cushion', variant: 0, start: { x: 2.7, y: 3.1 }, startRotation: -8 },
    { id: 'cushion-b', category: 'cushion', asset: 'cushion', variant: 1, start: { x: 7.0, y: 6.6 }, startRotation: 14 },
    // 2 shoes → entry mat
    { id: 'shoe-a', category: 'shoe', asset: 'shoe', variant: 0, start: { x: 8.3, y: 5.2 }, startRotation: -6 },
    { id: 'shoe-b', category: 'shoe', asset: 'shoe', variant: 1, start: { x: 8.8, y: 6.1 }, startRotation: 16 },
    // 2 folded towels → linen shelf
    { id: 'towel-a', category: 'towel', asset: 'towel', variant: 0, start: { x: 3.0, y: 2.1 }, startRotation: 6 },
    { id: 'towel-b', category: 'towel', asset: 'towel', variant: 1, start: { x: 5.7, y: 2.0 }, startRotation: -12 },
  ],
};
