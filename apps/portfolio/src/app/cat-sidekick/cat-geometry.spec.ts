import { cardPerch } from './cat-geometry';

describe('Cat landing safety', () => {
  const card = {
    left: 100,
    right: 460,
    top: 350,
    bottom: 850,
    width: 360,
    height: 500,
  };
  it('keeps the cat above a card and inside its edges even when the cursor is outside', () => {
    const left = cardPerch(card, 118, 130, 1440, 900, 92, -100);
    const right = cardPerch(card, 118, 130, 1440, 900, 92, 2000);
    expect(left?.x).toBe(110);
    expect(right?.x).toBe(332);
    expect(left?.y).toBe(222);
  });
  it('rejects a landing that would place the cat beneath the sticky header', () => {
    expect(
      cardPerch({ ...card, top: 210 }, 118, 130, 1440, 900, 92, 200),
    ).toBeNull();
  });
  it('rejects cards outside the viewport and cards narrower than the drawing', () => {
    expect(
      cardPerch({ ...card, top: 1100 }, 118, 130, 1440, 900, 92, 200),
    ).toBeNull();
    expect(
      cardPerch(
        { ...card, width: 100, right: 200 },
        118,
        130,
        1440,
        900,
        92,
        200,
      ),
    ).toBeNull();
  });
});
