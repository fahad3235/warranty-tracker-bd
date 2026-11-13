/* Warranty Tracker BD - data: categories + one clearly-labelled example entry.
   No real brand or warranty claims are shipped: the example is a placeholder
   the user edits or deletes, and every other entry is typed in by the user. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WT_DATA = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CATEGORIES = [
    { id: 'electronics', en: 'Electronics' },
    { id: 'appliance', en: 'Appliance' },
    { id: 'mobile', en: 'Mobile' },
    { id: 'vehicle', en: 'Vehicle' },
    { id: 'home', en: 'Home' },
    { id: 'other', en: 'Other' },
  ];

  /* One example entry so the dashboard is not empty on first open.
     It is marked isExample and the UI labels it as an example to edit/delete. */
  var EXAMPLE_ENTRY = {
    id: 'example-1',
    name: 'Example: Samsung TV 43in',
    brand: 'Samsung',
    category: 'electronics',
    purchaseDate: '2026-01-15',
    warrantyMonths: 24,
    price: 45000,
    seller: 'Example Shop',
    notes: '',
    isExample: true,
  };

  var STORAGE_KEY = 'wtbd-v1';
  var APP_VERSION = 1;

  return { CATEGORIES, EXAMPLE_ENTRY, STORAGE_KEY, APP_VERSION };
});
