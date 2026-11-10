export const framing = { width: 600, height: 540, viewportWidth: 1100, cropX: 420, cropTop: 80, cropBottom: 36,
  focus: [0.64, 0.77], zoom: 2.8, subjectAt: [0.65, 0.72], panelAt: [0.26, 0.02],
  restOnPanel: true, tool: 'Smart fill' };

export const showcase = {
  title: 'Choose the region. Choose the reach.',
  description: 'Explore suggested regions, then label one connected area, matching pixels in your view, or matching pixels across the image.',
  targetSeconds: [20, 30],
  beats: ['Preview three distinct forest masks without moving the cursor', 'Label one forest region with Local', 'Extend the labels with In viewport',
    'Reveal the view boundary', 'Apply Global and reveal labels beyond the boundary'],
};

export async function prepare(page) {
  await page.getByText('Forest', { exact: true }).click();
  const source = page.getByRole('slider', { name: 'Source mask', exact: true });
  if (Number(await source.getAttribute('max')) !== 15) throw new Error('This showcase expects the scene’s 16 standard masks.');
  await source.press('Home');
  for (let index = 0; index < 4; index++) await source.press('ArrowRight');
  if (await source.inputValue() !== '4') throw new Error('Mask 5 could not be selected.');
  await page.getByRole('radio', { name: /^Local:/ }).click();
  const replace = page.getByRole('switch', { name: 'Replace existing', exact: true });
  if (await replace.isVisible() && await replace.getAttribute('aria-checked') === 'true') await replace.click();
}

export default async function smartFill(demo) {
  const subject = await demo.point(...framing.focus);
  const source = demo.page.getByRole('slider', { name: 'Source mask', exact: true });
  await demo.hold(700);
  await demo.move(subject, 550);
  await demo.hold(900);
  // SATIFY's native Shift + scroll changes the mask under a stationary pointer.
  // The visible card and changing preview communicate the selection together.
  for (const index of [5, 6]) {
    await demo.page.keyboard.down('Shift');
    try { await demo.page.mouse.wheel(0, 80); }
    finally { await demo.page.keyboard.up('Shift'); }
    await demo.page.waitForFunction(index => document.querySelector('input[aria-label="Source mask"]')?.value === String(index), index);
    if (Number(await source.inputValue()) !== index) throw new Error('Mask selection did not advance.');
    await demo.hold(1600);
  }

  let initialViewport;
  for (const scope of ['Local', 'In viewport', 'Global']) {
    const option = demo.page.getByRole('radio', { name: new RegExp(`^${scope}:`) });
    if (scope !== 'Local') await demo.click(option);
    if (await option.getAttribute('aria-checked') !== 'true') throw new Error(`${scope} scope was not selected.`);
    if (scope !== 'Local') await demo.move(subject, 550);
    await demo.hold(650);
    await demo.fill(...framing.focus, scope);
    await demo.settle();
    await demo.hold(650);
    if (scope === 'In viewport') {
      initialViewport = await demo.zoomAt(0.5, subject);
      await demo.viewportOutline(initialViewport);
      await demo.settle();
      await demo.hold(1300);
    } else if (scope === 'Global') {
      await demo.viewportOutline(null);
      await demo.zoomAt(0.5, subject);
      await demo.park();
      await demo.viewportOutline({
        x: subject.x + (initialViewport.x - subject.x) * 0.5,
        y: subject.y + (initialViewport.y - subject.y) * 0.5,
        width: initialViewport.width * 0.5, height: initialViewport.height * 0.5,
      });
      await demo.settle();
      await demo.hold(2600);
    }
  }
}
