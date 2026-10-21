export interface SampleProduct {
  id: string;
  sku: string;
  barcode: string;
  nameEn: string;
  nameAm?: string;
  category: string;
  price: number;
  costPrice: number;
  isVat: boolean;
  stockOnHand: number;
  minStock: number;
  isWeighed?: boolean;
}

export const SAMPLE_CATEGORIES = [
  'ALL',
  'Dairy & Eggs',
  'Bakery & Grains',
  'Fresh Produce',
  'Beverages',
  'Household',
  'Meat & Butchery',
];

export const SAMPLE_PRODUCTS: SampleProduct[] = [
  {
    id: 'prod-01',
    sku: 'MILK-ANCHOR-1L',
    barcode: '6001234567890',
    nameEn: 'Anchor UHT Whole Milk 1L',
    nameAm: 'አንከር ወተት 1 ሊትር',
    category: 'Dairy & Eggs',
    price: 110.0,
    costPrice: 85.0,
    isVat: true,
    stockOnHand: 48,
    minStock: 20,
  },
  {
    id: 'prod-02',
    sku: 'FLOUR-TEFF-MAGNA-5K',
    barcode: '6009876543210',
    nameEn: 'Magna White Teff Flour 5KG',
    nameAm: 'የማኛ ጤፍ ዱቄት 5 ኪ.ግ',
    category: 'Bakery & Grains',
    price: 680.0,
    costPrice: 520.0,
    isVat: false, // Staple food tax exempt
    stockOnHand: 14,
    minStock: 15, // Low stock!
  },
  {
    id: 'prod-03',
    sku: 'OIL-SUNFLOWER-3L',
    barcode: '6005544332211',
    nameEn: 'Golden Star Sunflower Oil 3L',
    nameAm: 'የሱፍ ዘይት 3 ሊትር',
    category: 'Bakery & Grains',
    price: 890.0,
    costPrice: 720.0,
    isVat: true,
    stockOnHand: 32,
    minStock: 10,
  },
  {
    id: 'prod-04',
    sku: 'WATER-HIGHLAND-1L',
    barcode: '6001122334455',
    nameEn: 'Highland Spring Natural Water 1L',
    nameAm: 'ሃይላንድ ውኃ 1 ሊትር',
    category: 'Beverages',
    price: 35.0,
    costPrice: 24.0,
    isVat: true,
    stockOnHand: 120,
    minStock: 40,
  },
  {
    id: 'prod-05',
    sku: 'COFFEE-YIRGA-500G',
    barcode: '6007788990011',
    nameEn: 'Tomoca Yirgacheffe Roast 500G',
    nameAm: 'ቶሞካ ይርጋጨፌ ቡና 500ግ',
    category: 'Beverages',
    price: 450.0,
    costPrice: 340.0,
    isVat: true,
    stockOnHand: 25,
    minStock: 10,
  },
  {
    id: 'prod-06',
    sku: 'BANANA-HAWASSA-KG',
    barcode: '2010450000000', // Weighed scale prefix
    nameEn: 'Hawassa Sweet Bananas (Scale)',
    nameAm: 'የሐዋሳ ሙዝ',
    category: 'Fresh Produce',
    price: 85.0,
    costPrice: 60.0,
    isVat: false,
    stockOnHand: 45.5,
    minStock: 15,
    isWeighed: true,
  },
  {
    id: 'prod-07',
    sku: 'BEEF-TENDERLOIN-KG',
    barcode: '2020250000000', // Weighed scale prefix
    nameEn: 'Fresh Beef Tenderloin (Scale)',
    nameAm: 'የበሬ ሥጋ ፍርምባ',
    category: 'Meat & Butchery',
    price: 950.0,
    costPrice: 750.0,
    isVat: true,
    stockOnHand: 18.2,
    minStock: 10,
    isWeighed: true,
  },
  {
    id: 'prod-08',
    sku: 'SOAP-BARAKA-4P',
    barcode: '6003322114455',
    nameEn: 'Baraka Laundry Soap Pack of 4',
    nameAm: 'በረካ የልብስ ሳሙና',
    category: 'Household',
    price: 180.0,
    costPrice: 135.0,
    isVat: true,
    stockOnHand: 60,
    minStock: 25,
  },
];
