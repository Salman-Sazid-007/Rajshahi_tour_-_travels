import { test, expect } from '@playwright/test';
import seed from '../src/lib/seedData.json' with { type: 'json' };

test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(new Date('2026-10-03T00:00:00Z')); });

const classic = '/Rajshahi_tour_-_travels/';
const pro = classic + 'pro/';
const storage = 'rtt_github_pages_store_v1';
const setEnglish = (page) => page.addInitScript(() => localStorage.setItem('rtt_language','en'));
const configureDemoBus = (data) => {
  data.buses[0].services = data.buses[0].services.map((s) => ({ ...s, enabled:true, departureTime:'21:30', fare:700, boardingPoint:s.from==='Rajshahi'?'Sopura Mor':'Dhaka terminal' }));
  return data;
};
const installFixture = (page, data) => page.addInitScript(({storage,data}) => { localStorage.setItem(storage,JSON.stringify(data));localStorage.setItem('rtt_language','en'); },{storage,data});

test('both static editions load at the GitHub project prefix with no runtime errors', async ({ page }) => {
  const errors=[];page.on('pageerror',(error)=>errors.push(error.message));
  await page.goto(pro);await expect(page.getByRole('heading',{name:'Make room for wonder.'})).toBeVisible();
  await expect(page.locator('.pro-tour-card')).toHaveCount(3);
  const images=await page.locator('img').evaluateAll((items)=>items.filter((img)=>!img.loading||img.loading!=='lazy').every((img)=>img.complete&&img.naturalWidth>0));
  expect(images).toBeTruthy();
  await page.getByRole('link',{name:'Classic Edition বাংলা'}).first().click();
  await expect(page).toHaveURL(classic);
  await expect(page.locator('h1')).toContainText('From Rajshahi');
  await expect(page.locator('#bus-tickets')).toBeVisible();
  expect(errors).toEqual([]);
});
test('upper tour rail scrolls through live and upcoming tour cards', async ({ page }) => {
  await setEnglish(page);await page.goto(classic);
  const rail=page.locator('.rtt-tour-ticker');
  await expect(rail).toBeVisible();
  await expect(rail.locator('.rtt-tour-ticker-status.live')).toHaveCount(1);
  await expect(rail.locator('.rtt-tour-ticker-status.upcoming').first()).toBeVisible();
  await rail.getByRole('button',{name:'Pause tour carousel'}).click();
  await expect(rail.getByRole('button',{name:'Resume tour carousel'})).toHaveAttribute('aria-pressed','true');
  const track=rail.locator('.rtt-tour-ticker-track');
  const before=await track.evaluate((element)=>element.scrollLeft);
  await rail.getByRole('button',{name:'Next tours'}).click();
  await expect.poll(()=>track.evaluate((element)=>element.scrollLeft)).toBeGreaterThan(before);
});
test('language switching stays in the same edition and persists across both designs', async ({ page }) => {
  await page.goto(pro);
  await page.getByRole('button',{name:'বাংলা',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('lang','bn');
  await expect(page.locator('h1')).toContainText('বিস্ময়ে');
  await expect(page.locator('#rtt-bus-heading')).toContainText('রাজশাহী');
  await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','bn');
  await page.locator('.pro-topline a').last().click();await expect(page.locator('html')).toHaveAttribute('lang','bn');
  await page.getByRole('button',{name:'EN',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.locator('h1')).toContainText('From Rajshahi');
  await page.getByRole('link',{name:'Pro Edition ↗',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('lang','en');
});
test('search, category filters and sort control change the actual journey results', async ({ page }) => {
  await page.goto(pro);
  await page.getByLabel('Destination',{exact:true}).selectOption('coxs');
  await page.getByLabel('Departure month').selectOption('2026-11');
  await page.getByRole('button',{name:'Let’s explore',exact:true}).click();
  await expect(page.locator('.pro-tour-card')).toHaveCount(1);await expect(page.locator('.pro-tour-card h3')).toContainText('Cox');
  await page.getByRole('button',{name:'Clear search filters'}).click();
  await page.getByRole('button',{name:'Hill escapes',exact:true}).click();
  await expect(page.locator('.pro-tour-card')).toHaveCount(1);await expect(page.locator('.pro-tour-card h3')).toContainText('Sajek');
  await page.getByRole('button',{name:'All journeys',exact:true}).click();
  await page.getByLabel('Sort journeys',{exact:true}).selectOption('soonest');
  await expect(page.locator('.pro-tour-card h3').first()).toContainText('Sajek');
});
test('shortlist is functional and survives reload', async ({ page }) => {
  await page.goto(pro);await page.locator('.pro-save-button').first().click();
  await page.getByRole('button',{name:/My shortlist/}).click();
  await expect(page.locator('.pro-tour-card')).toHaveCount(1);
  await page.reload();await page.getByRole('button',{name:/My shortlist/}).click();
  await expect(page.locator('.pro-tour-card')).toHaveCount(1);
  await page.locator('.pro-save-button').click();await expect(page.locator('.pro-empty')).toContainText('favorites');
});
test('Classic mobile drawer is a side panel and the brand always returns to its edition home', async ({ page }) => {
  await setEnglish(page);await page.setViewportSize({width:390,height:844});await page.goto(classic+'#upcoming');
  await page.getByRole('link',{name:'Go to the home page'}).click();
  await expect(page).toHaveURL(classic+'#top');
  await page.getByRole('button',{name:'Open navigation menu'}).click();
  const drawer=page.locator('#rtt-mobile-navigation');
  await expect(drawer).toBeVisible();await expect(drawer).toHaveClass(/is-open/);
  await drawer.getByRole('link',{name:'Bus tickets',exact:true}).click();
  await expect(page).toHaveURL(classic+'#bus-tickets');
  await expect(page.getByRole('button',{name:'Open navigation menu'})).toHaveAttribute('aria-expanded','false');
  await page.getByRole('button',{name:'Open navigation menu'}).click();await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Open navigation menu'})).toHaveAttribute('aria-expanded','false');
});
test('USD prices are explicitly approximate, never a live-rate claim', async ({ page }) => {
  await page.goto(pro);await page.getByLabel('Display currency').selectOption('USD');
  await expect(page.locator('#pro-currency-note')).toContainText('not a live rate');
  await expect(page.locator('.pro-card-bottom strong').first()).toContainText('≈ $');
});
test('tour inquiry requires actual seats and M/F gender and stores a local pending request', async ({ page }) => {
  await page.goto(pro);await page.getByRole('button',{name:/View journey: Sylhet/}).click();
  const modal=page.getByRole('dialog');await modal.getByRole('tab',{name:'Plan this trip'}).click();
  await modal.getByLabel('Full name').fill('Test Traveler');await modal.getByLabel('Phone / WhatsApp').fill('+15555550100');
  await modal.getByLabel('Number of guests').fill('1');
  await modal.getByRole('button',{name:'Seat F-1: Available',exact:true}).click();
  await modal.getByLabel('Passenger gender for seat F-1').selectOption('female');
  await modal.locator('input[name="consent"]').check();
  await modal.getByRole('button',{name:'Save demo inquiry',exact:true}).click();
  await expect(modal).toContainText('Your demo inquiry is saved');await expect(modal).toContainText('nothing has been sent');
  const state=await page.evaluate((key)=>JSON.parse(localStorage.getItem(key)),storage);
  expect(state.tourSeatRequests[0].status).toBe('pending');expect(state.tourSeatRequests[0].seats).toEqual([{id:'F-1',gender:'female'}]);
  await page.keyboard.press('Escape');await expect(modal).not.toBeVisible();
});
test('Classic tour booking uses the same seat map and public contact', async ({ page }) => {
  await setEnglish(page);await page.goto(classic);
  await page.getByRole('button',{name:'Book this tour',exact:true}).first().click();
  await expect(page.locator('.rtt-tour-seat-field')).toBeVisible();
  await expect(page.locator('.rtt-seat-row')).toHaveCount(10);
  await expect(page.locator('.rtt-bkash-info').first()).toContainText('01782250709');
  await expect(page.getByRole('button',{name:'Seat A-1: Booked',exact:true})).toBeDisabled();
});
test('regular bus section stays visible but ticket sales remain unavailable before configuration', async ({ page }) => {
  await page.goto(pro);
  await page.getByLabel('Bus journey date').fill('2099-01-05');
  await expect(page.locator('.rtt-service-card')).toHaveCount(2);
  await expect(page.locator('.rtt-availability').first()).toContainText('Schedule and fare');
  await expect(page.locator('.rtt-service-card .rtt-button').first()).toBeDisabled();
});
test('configured regular bus booking has the 40-seat map, male/female markers and a pending receipt', async ({ page }) => {
  await installFixture(page,configureDemoBus(structuredClone(seed)));await page.goto(pro);
  await page.getByLabel('Bus journey date').fill('2099-01-05');
  await page.locator('.rtt-service-card .rtt-button').first().click();
  const modal=page.getByRole('dialog');await expect(modal.locator('.rtt-seat')).toHaveCount(40);
  await modal.getByRole('button',{name:'Seat J-4: Available',exact:true}).click();
  await modal.getByLabel('Passenger gender for seat J-4').selectOption('male');
  await modal.getByLabel('Passenger name').fill('Bus Traveler');await modal.getByLabel('Phone / WhatsApp').fill('+15555550101');
  await modal.getByRole('button',{name:'Save demo reservation',exact:true}).click();
  await expect(modal).toContainText('Demo reservation saved');await expect(modal).toContainText('not a real ticket');
  await expect(modal.locator('.rtt-ticket-receipt')).toContainText('৳700');
  const state=await page.evaluate((key)=>JSON.parse(localStorage.getItem(key)),storage);
  expect(state.busTickets[0].status).toBe('pending');expect(state.busTickets[0].seats[0]).toEqual({id:'J-4',gender:'male'});
  await page.keyboard.press('Escape');await page.locator('.rtt-service-card .rtt-button').first().click();
  await expect(page.getByRole('button',{name:'Seat J-4: Held · male',exact:true})).toBeDisabled();
});
test('tour-day closure and maintenance status are visible, not silently hidden', async ({ page }) => {
  await installFixture(page,configureDemoBus(structuredClone(seed)));await page.goto(pro);
  await page.getByLabel('Bus journey date').fill('2099-01-05');
  await page.evaluate((key)=>{const state=JSON.parse(localStorage.getItem(key));state.tours[0].startDate='2099-01-05';state.tours[0].returnDate='2099-01-07';localStorage.setItem(key,JSON.stringify(state));},storage);
  await page.getByRole('button',{name:'Refresh availability',exact:true}).click();
  await expect(page.locator('.rtt-availability').first()).toContainText('Bus is on tour');
  await page.evaluate((key)=>{const state=JSON.parse(localStorage.getItem(key));state.buses[0].status='maintenance';localStorage.setItem(key,JSON.stringify(state));},storage);
  await page.getByRole('button',{name:'Refresh availability',exact:true}).click();
  await expect(page.locator('.rtt-availability').first()).toContainText('Bus under repair');
});
test('real remaining count of 10 triggers a red alert in both editions', async ({ page }) => {
  const fixture=structuredClone(seed);fixture.tours.find((t)=>t.id==='tour-sylhet-oct').totalSeats=28;
  await installFixture(page,fixture);await page.goto(pro);
  await expect(page.locator('.pro-tour-card .rtt-low-seats')).toContainText('Only 10 seats left!');
  await page.goto(classic);await expect(page.locator('.rtt-low-seats').first()).toContainText('Only 10 seats left!');
});
test('staff navigation collapses into an accessible mobile drawer', async ({ page }) => {
  await setEnglish(page);await page.setViewportSize({width:390,height:844});await page.goto(classic+'?staff=1');
  await page.getByRole('button',{name:'Sign in',exact:true}).first().click();
  const menu=page.getByRole('button',{name:'Open staff navigation'});
  await expect(menu).toBeVisible();await menu.click();
  const sidebar=page.locator('#admin-navigation');
  await expect(sidebar).toBeVisible();
  await sidebar.getByRole('button',{name:/Tours & budget planner/}).click();
  await expect(page.getByRole('button',{name:'Open staff navigation'})).toHaveAttribute('aria-expanded','false');
  await page.getByRole('button',{name:'Open staff navigation'}).click();await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Open staff navigation'})).toHaveAttribute('aria-expanded','false');
});
test('owner configures fares and repair status from the bilingual fleet panel', async ({ page }) => {
  await setEnglish(page);await page.goto(classic+'?staff=1');
  await page.getByRole('button',{name:'Sign in',exact:true}).first().click();
  await page.getByRole('button',{name:'Bus profiles & tickets',exact:true}).click();
  await page.getByLabel('Rajshahi departure time').fill('21:30');await page.getByLabel('Rajshahi fare').fill('700');await page.getByLabel('Rajshahi boarding point').fill('Sopura Mor');
  await page.getByLabel('Enable Rajshahi service').check();
  await page.getByRole('button',{name:'Save bus & service settings',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Demo changes saved only in this browser.');
  const state=await page.evaluate((key)=>JSON.parse(localStorage.getItem(key)),storage);
  expect(state.buses[0].services[0].fare).toBe(700);expect(state.buses[0].services[0].enabled).toBe(true);
  await page.getByLabel('Bus status',{exact:true}).selectOption('maintenance');
  await page.getByRole('button',{name:'Save bus & service settings',exact:true}).click();
  await page.getByRole('button',{name:'বাংলা',exact:true}).click();
  await expect(page.locator('.rtt-fleet')).toContainText('বাস প্রোফাইল');
});
test('standalone /pro/ copy links back to /docs/ correctly', async ({ page }) => {
  await page.goto('/pro/');await expect(page.locator('h1')).toContainText('Make room');
  await page.locator('.pro-topline a').last().click();await expect(page).toHaveURL('/docs/');await expect(page.locator('h1')).toContainText('From Rajshahi');
});
for (const width of [360,390,768,1440]) {
  test(`Pro and Classic do not overflow horizontally at ${width}px`,async ({page})=>{
    await page.setViewportSize({width,height:900});await page.goto(pro);
    await expect(page.locator('.pro-tour-card')).toHaveCount(3);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
    if(width<1000){await page.getByRole('button',{name:'Open navigation menu'}).click();await expect(page.getByRole('navigation').getByRole('link',{name:'Bus tickets'})).toBeVisible();await page.keyboard.press('Escape');}
    await page.goto(classic);await expect(page.locator('h1')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  });
}

test('tour builder uses an added 40-seat profile and publishes its bilingual public description', async ({ page }) => {
  await setEnglish(page);await page.goto(classic+'?staff=1');
  await page.getByRole('button',{name:'Sign in',exact:true}).first().click();
  await page.getByRole('button',{name:'Bus profiles & tickets',exact:true}).click();
  await page.getByRole('button',{name:'Add bus profile',exact:true}).click();
  await page.getByLabel('Bus name (English)',{exact:true}).fill('Test coach');
  await page.getByLabel('Bus name (Bangla)',{exact:true}).fill('পরীক্ষার বাস');
  await page.getByLabel('Seat layout',{exact:true}).selectOption('standard40');
  await page.getByRole('button',{name:'Save bus & service settings',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Demo changes saved');
  const fleet=await page.evaluate((key)=>JSON.parse(localStorage.getItem(key)).buses,storage);
  const bus=fleet.find((item)=>item.name==='Test coach');expect(bus.layout).toBe('standard40');
  await page.getByRole('button',{name:'Tours & budget planner',exact:true}).click();
  await page.getByRole('button',{name:'Create a new tour',exact:true}).click();
  await page.getByLabel('Tour title in English',{exact:true}).fill('Test bilingual tour');
  await page.getByLabel('Destination in English',{exact:true}).fill('Sylhet');
  await page.getByLabel('Tour description in Bangla',{exact:true}).fill('পরিবারের জন্য আরামদায়ক সিলেট ভ্রমণ।');
  await page.getByLabel('Tour description in English',{exact:true}).fill('A relaxed public overview with tea gardens, quiet rivers and a friendly local guide.');
  const form=page.locator('form').filter({has:page.getByLabel('Tour bus profile',{exact:true})});
  await form.locator('input[type="date"]').first().fill('2099-02-01');
  await page.getByLabel('Tour bus profile',{exact:true}).selectOption(bus.id);
  await expect(form.locator('.rtt-seat')).toHaveCount(40);
  await form.locator('button[type="submit"]').click();
  await expect(form).not.toBeVisible();
  const tours=await page.evaluate((key)=>JSON.parse(localStorage.getItem(key)).tours,storage);
  const tour=tours.find((item)=>item.titleEn==='Test bilingual tour');
  expect(tour.busId).toBe(bus.id);expect(tour.totalSeats).toBe(40);expect(tour.destinationEn).toBe('Sylhet');
  expect(tour.description).toBe('পরিবারের জন্য আরামদায়ক সিলেট ভ্রমণ।');
  expect(tour.descriptionEn).toBe('A relaxed public overview with tea gardens, quiet rivers and a friendly local guide.');
  await page.goto(classic);
  const publicCard=page.locator('.rtt-public-tour-card').filter({hasText:'Test bilingual tour'});
  await publicCard.getByRole('button',{name:'Full details',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('A relaxed public overview with tea gardens, quiet rivers and a friendly local guide.');
});
