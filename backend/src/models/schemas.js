'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    email: { type: String, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['owner', 'accountant', 'guide'], default: 'guide' },
    designation: { type: String, default: '' },
    avatar: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    bio: { type: String, default: '' },
    allowancePerTour: { type: Number, default: 2500 },
  },
  { timestamps: true }
);

const PackageSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['couple', 'shared_4', 'shared_3', 'single', 'custom'], default: 'shared_4' },
    roomType: { type: String, enum: ['ac', 'non_ac'], default: 'non_ac' },
    personsPerUnit: { type: Number, default: 1 },
    price: { type: Number, required: true },
    description: { type: String, default: '' },
  },
  { _id: false }
);

const AddonSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    mandatory: { type: Boolean, default: false },
  },
  { _id: false }
);

const TourSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, trim: true },
    destination: { type: String, required: true, trim: true },
    status: { type: String, enum: ['running', 'upcoming', 'completed', 'draft'], default: 'upcoming' },
    isPublished: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    startDate: { type: String, required: true },
    days: { type: Number, default: 2 },
    nights: { type: Number, default: 3 },
    returnDate: { type: String, required: true },
    departureLocation: { type: String, default: 'সপুরা মোড়, রাজশাহী' },
    totalSeats: { type: Number, default: 40 },
    coverImage: { type: String, default: '' },
    posterImage: { type: String, default: '' },
    galleryImages: [{ type: String }],
    packages: [PackageSchema],
    addons: [AddonSchema],
    transport: {
      primary: { type: String, default: 'নন-এসি বাস (Non-AC Bus)' },
      local: { type: String, default: 'চাঁদের গাড়ি (Chander Gari)' },
      notes: { type: String, default: '' },
    },
    guideIds: [{ type: String }],
    mealPlan: { type: Array, default: [] },
    itinerary: { type: Array, default: [] },
    marketingCaption: { type: String, default: '' },
    budget: {
      foodCostPerPerson: { type: Number, default: 0 },
      foodTotal: { type: Number, default: 0 },
      busCost: { type: Number, default: 0 },
      hotelCost: { type: Number, default: 0 },
      localTransportCost: { type: Number, default: 0 },
      guideCost: { type: Number, default: 0 },
      marketingCost: { type: Number, default: 0 },
      otherCost: { type: Number, default: 0 },
      totalBudget: { type: Number, default: 0 },
      minTravelersToBreakEven: { type: Number, default: 35 },
    },
  },
  { timestamps: true }
);

const BookingSchema = new Schema(
  {
    bookingCode: { type: String, required: true, unique: true },
    tourId: { type: String, required: true, index: true },
    customerId: { type: String, index: true },
    customerName: { type: String, required: true },
    customerPhone: { type: String, required: true, index: true },
    pax: { type: Number, default: 1 },
    seatNumbers: { type: String, default: '' },
    packageId: { type: String },
    packageName: { type: String },
    packageUnitPrice: { type: Number, default: 0 },
    addonsSelected: { type: Array, default: [] },
    extraCharge: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    discountReason: { type: String, default: '' },
    totalAmount: { type: Number, required: true },
    advancePaid: { type: Number, default: 0 },
    dueAmount: { type: Number, default: 0 },
    paymentMethod: { type: String, enum: ['bkash', 'nagad', 'cash', 'bank'], default: 'bkash' },
    source: { type: String, enum: ['phone', 'facebook', 'website', 'walkin'], default: 'phone' },
    status: { type: String, enum: ['confirmed', 'pending', 'cancelled'], default: 'confirmed' },
    notes: { type: String, default: '' },
    feedbackSubmitted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const InquirySchema = new Schema(
  {
    tourId: { type: String, default: '' },
    tourTitle: { type: String, default: '' },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    pax: { type: Number, default: 1 },
    preferredPackage: { type: String, default: '' },
    message: { type: String, default: '' },
    status: { type: String, enum: ['new', 'contacted', 'converted', 'closed'], default: 'new' },
    adminNote: { type: String, default: '' },
  },
  { timestamps: true }
);

const CustomerSchema = new Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    email: { type: String, default: '' },
    address: { type: String, default: 'রাজশাহী' },
    tags: [{ type: String }],
    toursCompleted: [{ type: String }],
    totalBookings: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    totalDue: { type: Number, default: 0 },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

const SmsLogSchema = new Schema(
  {
    recipientName: { type: String, default: '' },
    phone: { type: String, required: true },
    message: { type: String, required: true },
    category: { type: String, default: 'manual' },
    tourId: { type: String, default: '' },
    bookingId: { type: String, default: '' },
    status: { type: String, enum: ['delivered', 'sent', 'simulated', 'failed'], default: 'delivered' },
    gateway: { type: String, default: 'Automas/MimSMS' },
    encoding: { type: String, default: 'unicode' },
    segments: { type: Number, default: 1 },
    sentBy: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = {
  UserModel: mongoose.models.User || mongoose.model('User', UserSchema),
  TourModel: mongoose.models.Tour || mongoose.model('Tour', TourSchema),
  BookingModel: mongoose.models.Booking || mongoose.model('Booking', BookingSchema),
  InquiryModel: mongoose.models.Inquiry || mongoose.model('Inquiry', InquirySchema),
  CustomerModel: mongoose.models.Customer || mongoose.model('Customer', CustomerSchema),
  SmsLogModel: mongoose.models.SmsLog || mongoose.model('SmsLog', SmsLogSchema),
};
