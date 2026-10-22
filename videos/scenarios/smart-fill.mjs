export const framing = { width: 600, height: 540, viewportWidth: 1000, focus: [0.60, 0.64], zoom: 4.5,
  subjectAt: [0.58, 0.69], panelAt: [0.72, 0.02], tool: 'Smart fill' };

export default async function smartFill(demo) {
  await demo.caption('Compare masks on the same region');
  await demo.choose('Smart fill');
  const source = demo.page.getByRole('slider', { name: 'Source mask', exact: true });
  if (Number(await source.getAttribute('max')) < 2) throw new Error('This scenario needs at least three masks.');
  const subject = await demo.point(...framing.focus);
  await demo.move(subject);
  await demo.hold(500);
  for (let index = 1; index <= 2; index++) {
    const before = await source.inputValue();
    await demo.choose('Next mask');
    await demo.page.waitForFunction(({ before }) => document.querySelector('input[aria-label="Source mask"]')?.value !== before, { before });
    await demo.move(subject);
    await demo.hold(500);
  }
  // Keep the chosen source fixed so only the fill scope changes in this comparison.
  for (const [name, caption] of [
    ['Local', 'Local · One connected region'],
    ['In viewport', 'In viewport · Matching pixels in view'],
    ['Global', 'Global · Matching pixels across the image'],
  ]) {
    await demo.caption(caption);
    const option = demo.page.getByRole('radio', { name: new RegExp(`^${name}:`) });
    await demo.click(option);
    if (await option.getAttribute('aria-checked') !== 'true') throw new Error(`${name} scope was not selected.`);
    await demo.move(subject);
    await demo.hold(450);
    const saved = demo.page.waitForResponse(response =>
      response.request().method() === 'POST' && response.url().includes('/session/fill/'), { timeout: 30_000 });
    const [response] = await Promise.all([saved, (async () => {
      await demo.page.mouse.down(); await demo.hold(80); await demo.page.mouse.up();
    })()]);
    if (!response.ok()) throw new Error(`${name} fill did not succeed.`);
    const body = response.request().postDataJSON();
    if (Math.abs(body.x - framing.focus[0] * demo.image.width) > 2
      || Math.abs(body.y - framing.focus[1] * demo.image.height) > 2) {
      throw new Error('The camera no longer maps the scripted point to the pond.');
    }
    if (body.by_label !== (name !== 'Local') || ('viewport' in body) !== (name !== 'Global')) {
      throw new Error(`${name} did not send the expected fill scope.`);
    }
    // Move onto the card so a new hover preview cannot obscure the saved result.
    await demo.park();
    await demo.hold(name === 'Local' ? 700 : 250);
    if (name !== 'Local') {
      await demo.caption('Zoom out to compare the extent');
      const originalViewport = await demo.zoomAt(0.25, subject);
      await demo.park();
      await demo.viewportOutline(originalViewport);
      await demo.caption(name === 'In viewport'
        ? 'In viewport · Stops at the boundary'
        : 'Global · Fills beyond the boundary', name === 'Global' ? 2200 : 1600);
    }
    if (name !== 'Global') {
      await demo.caption('Undo to compare the next scope');
      await demo.choose('Undo');
      await demo.hold(120);
      if (name === 'In viewport') {
        await demo.viewportOutline(null);
        await demo.caption('Return to the same view for Global');
        await demo.zoomAt(4, subject);
        await demo.park();
      }
    }
  }
}
