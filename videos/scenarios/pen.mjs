export const framing = { width: 600, height: 540, viewportWidth: 1000, focus: [0.60, 0.64], zoom: 4.5,
  subjectAt: [0.58, 0.62], panelAt: [0.72, 0.02], tool: 'Pen' };

export default async function pen(demo) {
  await demo.caption('Set the brush size, then drag to paint');
  await demo.choose('Pen');
  const size = demo.page.getByRole('textbox', { name: 'Pen size', exact: true });
  await demo.click(size);
  // Explicit pixels make the demonstration independent of the viewer's m/ft/px setting.
  await size.fill('4 px');
  await size.press('Enter');
  await demo.hold(600);
  await demo.move(await demo.point(0.59, 0.62));
  const saved = demo.page.waitForResponse(response =>
    response.request().method() === 'PUT' && response.url().includes('/labeltiles/'), { timeout: 30_000 });
  const drawing = (async () => {
    await demo.page.mouse.down();
    try {
      for (const [x, y] of [[0.60, 0.625], [0.607, 0.637], [0.608, 0.65], [0.606, 0.656]]) {
        await demo.move(await demo.point(x, y), 500);
      }
    } finally { await demo.page.mouse.up(); }
  })();
  const [response] = await Promise.all([saved, drawing]);
  if (!response.ok()) throw new Error('The Pen stroke could not be saved.');
  await demo.park();
  await demo.hold(1400);
}
