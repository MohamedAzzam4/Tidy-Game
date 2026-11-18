/**
 * Tidy Tapes — runtime art-family state (v4).
 *
 * `pilotArt` (settings key kept for save compatibility) now selects the
 * FULL-BOARD art family: true = the v4 cassette/cabinet/background template
 * everywhere; false = the pre-rollout procedural look, still baked under
 * `legacy-*` keys so the before/after comparator never perturbs the board.
 * Geometry is identical in both modes.
 */
class ArtState {
  pilotArt: boolean = true;
}

export const artState = new ArtState();
