export const framing = { width: 600, height: 540, viewportWidth: 1100, cropX: 420, cropTop: 80, cropBottom: 36,
  focus: [0.60, 0.64], zoom: 5, subjectAt: [0.68, 0.65], panelAt: [0.26, 0.02],
  // Rest beside the size label, away from mode and drag-handle tooltips.
  restAt: [0.22, 0.085], tool: 'Pen' };

export const showcase = {
  title: 'Make every detail count',
  description: 'Trace a boundary, then paint the area inside it. Fill gaps preserves existing labels even when your brush overlaps them.',
  targetSeconds: [20, 30],
  beats: ['Draw the outer yellow curve with Paint', 'Use a smaller yellow brush at the tight bend',
    'Select the blue Water label', 'Increase the blue brush to 8 pixels', 'Select Fill gaps',
    'Brush across the boundary and preserve its yellow pixels', 'Hold the two-colour result'],
};

// Native-pixel paths traced against this scene's pond and its dark shoreline.
// The 4/2-pixel yellow footprints stay on land. The 8-pixel blue footprints fit
// inside the closed outline, including where the lower channel narrows.
export const paths = {
  broadYellow: [[299.5, 308.5], [304.5, 308.5], [308.5, 311.5], [314.25, 316.5],
    [317.25, 327.5], [318.25, 334.5], [316.25, 341.5], [310.5, 344.5], [307.5, 344.5], [305.5, 341.5]],
  fineYellow: [[305.5, 341.5], [305.5, 332.5], [306.5, 331.5], [302.5, 327.5],
    [297.5, 327.5], [292.5, 322.5], [292.5, 315.5], [296.5, 309.5], [299.5, 308.5]],
  blue: [[299.5, 312.5], [305.5, 312.5], [310.5, 316.5], [307.5, 321.5],
    [301.5, 323.5], [295.5, 319.5], [296.5, 316.5], [301.5, 319.5], [310.5, 322.5],
    [311.5, 325.5], [307.5, 326.5], [313.5, 331.5], [309.5, 332.5],
    [313.5, 335.5], [309.5, 335.5], [310.5, 339.5]],
};

async function changeSize(demo, pixels) {
  const size = demo.page.getByRole('textbox', { name: 'Pen size', exact: true });
  await demo.click(size);
  await size.press('ControlOrMeta+A');
  await size.pressSequentially(`${pixels} px`, { delay: 150 });
  await size.press('Enter');
  if (await size.inputValue() !== String(pixels)) throw new Error('The demonstration brush size was not applied.');
}

export async function prepare(page) {
  const unit = page.getByRole('button', { name: /^Brush size in/ });
  for (let attempt = 0; attempt < 3 && (await unit.innerText()).trim() !== 'px'; attempt++) await unit.click();
  if ((await unit.innerText()).trim() !== 'px') throw new Error('The Pen showcase needs pixel units.');
  const size = page.getByRole('textbox', { name: 'Pen size', exact: true });
  await size.fill('4 px');
  await size.press('Enter');
  if (await size.inputValue() !== '4') throw new Error('The boundary brush was not applied.');
  await page.getByRole('radio', { name: 'Paint', exact: true }).click();
  await page.getByText('Open ground', { exact: true }).click();
  await page.getByRole('heading', { name: 'Current label: Open ground', exact: true }).waitFor();
}

export default async function pen(demo) {
  // Subpixel pan/wheel rounding shifts this fixed camera by about half a native
  // pixel. Calibrated against the saved native label tile and rendered scene;
  // recheck this alignment if the framing or browser changes.
  const native = points => points.map(([x, y]) => [(x - 0.544) / demo.image.width,
    (y + 0.505) / demo.image.height]);
  await demo.hold(1500);
  await demo.stroke(native(paths.broadYellow), 4500);
  await changeSize(demo, 2);
  await demo.stroke(native(paths.fineYellow), 3200);
  await demo.settle();
  await demo.hold(900);
  // Open the real label picker beside the tool card so the colour change stays
  // in the recording, rather than visiting the off-camera Labels panel.
  const pickerAt = await demo.point(0.574, 0.540);
  await demo.move(pickerAt, 500);
  await demo.page.mouse.click(pickerAt.x, pickerAt.y, { button: 'right' });
  const picker = demo.page.getByRole('dialog', { name: 'Select or create label', exact: true });
  await picker.waitFor({ state: 'visible' });
  await demo.hold(600);
  await demo.click(picker.getByRole('button', { name: 'Water', exact: true }));
  await picker.waitFor({ state: 'hidden' });
  await demo.page.getByRole('heading', { name: 'Current label: Water', exact: true }).waitFor();
  await changeSize(demo, 8);
  const gaps = demo.page.getByRole('radio', { name: /^Fill gaps/ });
  await demo.click(gaps);
  if (await gaps.getAttribute('aria-checked') !== 'true') throw new Error('Fill gaps mode was not selected.');
  // The wider blue brush overlaps the yellow outline. Native Fill gaps keeps
  // the existing yellow labels and paints only the unlabelled pixels.
  await demo.stroke(native(paths.blue), 5500);
  await demo.park();
  await demo.settle();
  await demo.hold(3000);
}
