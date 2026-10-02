import seedData from '../lib/seedData.json';
import { currentLanguage, translateText } from '../lib/i18n';

// Bundle the existing photography so /pro/ is also a self-contained static site.
const importedMedia = import.meta.glob('../../../backend/public/media/*.{jpg,webp,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
});
const media = Object.fromEntries(
  Object.entries(importedMedia).map(([file, url]) => [file.split('/').pop(), url]),
);

export const destinations = [
  { id: 'sajek', name: 'Sajek Valley', region: 'Rangamati · Hill country', category: 'hills', line: 'A little closer to the clouds.', image: media['sajek-3.jpg'] },
  { id: 'sylhet', name: 'Sylhet', region: 'Sylhet · Rivers & forests', category: 'nature', line: 'Every shade of extraordinary.', image: media['sylhet-1.jpg'] },
  { id: 'coxs', name: 'Cox’s Bazar', region: 'Chattogram · The coast', category: 'beach', line: 'Let the shoreline slow you down.', image: media['coxs-3.jpg'] },
  { id: 'sundarbans', name: 'Sundarbans', region: 'Khulna · Mangrove country', category: 'nature', line: 'Take a turn toward the wild.', image: media['sundarbans-2.jpg'] },
];

export const heroImage = media['sajek-3.jpg'];
export const storyImage = media['sajek-2.jpg'];
export const classicUrl = document.querySelector('meta[name="classic-edition-url"]')?.content || '../';

export function resolveProMedia(url, fallback = heroImage) {
  if (!url) return fallback;
  const filename = String(url).split('/').pop();
  if (/^(\.?\.?\/)?media\//.test(url) && media[filename]) return media[filename];
  if (url.startsWith('/media/') || url.startsWith('./media/')) {
    // Media added through the Classic CMS remains accessible under its site base.
    return new URL(`${classicUrl}media/${filename}`, window.location.href).href;
  }
  return url;
}

const translations = {
  'tour-sylhet-oct': {
    title: 'Sylhet: rivers, forests & tea',
    description: 'Clear-water rivers, quiet boat rides and a little tea-country magic. A refreshing escape with the details taken care of.',
    itinerary: [
      { title: 'White stones & a floating forest', spots: 'Bholaganj Sadapathor · Ratargul · Malnicherra tea garden', details: 'Arrive in Sylhet, check in and enjoy breakfast. Take a boat to Sadapathor, then explore Ratargul’s freshwater forest and the tea gardens.' },
      { title: 'Jaflong & the blue waters of Lalakhal', spots: 'Jaflong · Dawki River · Sangrampunji waterfall · Lalakhal', details: 'After breakfast, visit Jaflong and the waterfall. Enjoy lunch and a boat ride on Lalakhal before the overnight return to Rajshahi.' },
    ],
  },
  'tour-sajek-oct15': {
    title: 'Sajek Valley: above the clouds',
    description: 'Wake up to a sea of clouds, discover hill-country villages and share a special bamboo-biryani dinner.',
    itinerary: [
      { title: 'The road to the clouds', spots: 'Sajek Valley · Ruilui Para · Stone Garden · Helipad · Lusai village', details: 'Travel from Khagrachhari to Sajek by reserved local jeep. Explore the valley and its villages, then settle into the resort for the night.' },
      { title: 'Sunrise & a hill-country adventure', spots: 'Konglak Hill · Risang waterfall · Alutila Cave · Hanging bridge', details: 'Catch sunrise from Konglak Hill, then discover the highlights of Khagrachhari before beginning the return journey to Rajshahi.' },
    ],
  },
  'tour-coxs-nov': {
    title: 'Cox’s Bazar: a little coastal bliss',
    description: 'Salty air, unhurried sunsets and a ride along Marine Drive. Make a little room for life by the sea.',
    itinerary: [
      { title: 'Meet the sea', spots: 'Kolatoli · Sugandha Beach · Burmese market · Laboni Point', details: 'Arrive in Cox’s Bazar and check into the hotel. Spend the day by the sea and enjoy a sunset on the beach.' },
      { title: 'Along the coastline', spots: 'Himchhari · Inani · Patuartek · Marine Drive', details: 'Explore the coast by open-top jeep along Marine Drive, then enjoy a seafood barbecue in the evening.' },
    ],
  },
};

export function destinationFor(tour) {
  const identifier = `${tour.slug || ''} ${tour.destination || ''}`.toLowerCase();
  if (/sajek|সাজেক/.test(identifier)) return destinations[0];
  if (/sylhet|সিলেট/.test(identifier)) return destinations[1];
  if (/coxs|cox|কক্সবাজার/.test(identifier)) return destinations[2];
  if (/sundarbans|সুন্দরবন/.test(identifier)) return destinations[3];
  return { id: tour.destination || 'other', name: tour.destination || 'Bangladesh', category: 'other', region: 'Bangladesh', image: resolveProMedia(tour.coverImage) };
}

export function presentTour(tour) {
  const destination = destinationFor(tour);
  const source = seedData.tours.find((item) => item.id === tour.id);
  // Do not show an old translation if a tour has been edited in the CMS.
  const translated = source?.title === tour.title ? translations[tour.id] : null;
  const isBangla = currentLanguage() === 'bn';
  const translatedItinerary = translated && JSON.stringify(source.itinerary) === JSON.stringify(tour.itinerary);
  const prices = (tour.packages || [])
    .filter((pkg) => Number(pkg.price) > 0)
    .map((pkg) => Number(pkg.price) / Math.max(1, Number(pkg.personsPerUnit) || 1));
  return {
    ...tour,
    destinationInfo: destination,
    displayTitle: isBangla ? tour.title : tour.titleEn || translated?.title || translateText(tour.title, 'en'),
    description: translated?.description || 'A locally guided journey from Rajshahi. Explore the itinerary and talk to our team about the right package for you.',
    displayItinerary: !isBangla && translatedItinerary
      ? translated.itinerary
      : (tour.itinerary || []).map((day) => ({ title: day.dateLabel, spots: day.spots, details: day.details, original: true })),
    pricePerPerson: prices.length ? Math.min(...prices) : null,
    image: source?.title === tour.title && source?.coverImage?.split('/').pop() === tour.coverImage?.split('/').pop() && tour.id === 'tour-sajek-oct15' ? media['sajek-4.jpg'] : source?.title === tour.title && source?.coverImage?.split('/').pop() === tour.coverImage?.split('/').pop() && tour.id === 'tour-coxs-nov' ? media['coxs-3.jpg'] : resolveProMedia(tour.coverImage, destination.image),
  };
}

// This is an illustrative comparison, not a live exchange-rate quote.
export const illustrativeBdtPerUsd = 120;
export function formatPrice(amount, currency = 'BDT') {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return 'On request';
  const value = Number(amount);
  if (currency === 'USD') {
    return `≈ ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / illustrativeBdtPerUsd)}`;
  }
  return `৳${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value)}`;
}

export function formatDate(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!value) return 'Dates on request';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return 'Dates on request';
  return new Intl.DateTimeFormat(currentLanguage() === 'bn' ? 'bn-BD' : 'en-GB', { ...options, timeZone: 'UTC' }).format(date);
}

export function packageLabel(pkg) {
  const room = pkg.roomType === 'ac' ? 'AC' : 'Non-AC';
  if (pkg.type === 'couple') return currentLanguage() === 'bn' ? `দুজনের প্রাইভেট রুম · ${pkg.roomType === 'ac' ? 'এসি' : 'নন-এসি'}` : `Private room for two · ${room}`;
  if (pkg.type === 'shared_4') return currentLanguage() === 'bn' ? `চারজনের শেয়ারিং রুম · ${pkg.roomType === 'ac' ? 'এসি' : 'নন-এসি'}` : `Shared room · 4 guests · ${room}`;
  if (pkg.type === 'shared_3') return currentLanguage() === 'bn' ? `তিনজনের শেয়ারিং রুম · ${pkg.roomType === 'ac' ? 'এসি' : 'নন-এসি'}` : `Shared room · 3 guests · ${room}`;
  return pkg.name;
}

export function toEnglishNumerals(value) {
  return String(value || '').replace(/[০-৯]/g, (digit) => '০১২৩৪৫৬৭৮৯'.indexOf(digit));
}

const reviewTranslations = {
  'rev-1': { name: 'Israt Jahan', location: 'Motihar, Rajshahi', comment: 'Monirul’s guiding and the bamboo biryani in Sajek were truly wonderful! A very safe, well-organized tour group for women. I’m joining the Sylhet tour on 30 October too!' },
  'rev-2': { name: 'Mahmudul Hasan Sajib', location: 'Shaheb Bazar, Rajshahi', comment: 'Thank you for arranging such a beautiful, professional Sundarbans tour from Rajshahi. The food on the ship and the guides’ warmth were especially 10 out of 10.' },
  'rev-3': { name: 'Tania Parvez', location: 'Uposhohor, Rajshahi', comment: 'Five of us went as a family. The food and local jeep arrangements were very good. Hotel check-in could have been a little faster, but overall it was a great experience!' },
};

export function presentReview(review) {
  const original = seedData.reviews.find((item) => item.id === review.id);
  const translation = currentLanguage() === 'en' && original?.comment === review.comment && original?.customerName === review.customerName
    ? reviewTranslations[review.id]
    : null;
  return {
    ...review,
    name: translation?.name || review.customerName,
    location: translation?.location || review.customerLocation || 'Traveler',
    quote: translation?.comment || review.comment,
    translated: Boolean(translation),
  };
}

export function readPreference(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(`rtt_pro_${key}`));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export function savePreference(key, value) {
  try {
    localStorage.setItem(`rtt_pro_${key}`, JSON.stringify(value));
  } catch {
    // Browsing and booking still work when preferences cannot be persisted.
  }
}

export function filterJourneys(tours, filters, saved) {
  const filtered = tours.filter((tour) =>
    (filters.destination === 'all' || tour.destinationInfo.id === filters.destination) &&
    (filters.month === 'all' || String(tour.startDate).slice(0, 7) === filters.month) &&
    (filters.category === 'all' || tour.destinationInfo.category === filters.category) &&
    (!filters.savedOnly || saved.includes(tour.id)) &&
    (filters.guests <= 1 || tour.seatsLeft >= filters.guests),
  );
  return [...filtered].sort((a, b) => {
    if (filters.sort === 'price') return (a.pricePerPerson ?? Infinity) - (b.pricePerPerson ?? Infinity);
    if (filters.sort === 'soonest') return String(a.startDate).localeCompare(String(b.startDate));
    return Number(Boolean(b.isFeatured)) - Number(Boolean(a.isFeatured)) || String(a.startDate).localeCompare(String(b.startDate));
  });
}
