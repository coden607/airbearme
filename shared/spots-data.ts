// Binghamton AirBear Spots Data - Shared between client and server
export interface SpotData {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  description?: string;
  amenities?: string[];
  isActive: boolean;
}

export const spotsData: SpotData[] = [
  {
    id: 'court-street-downtown',
    name: 'Court Street Downtown',
    latitude: 42.099118,
    longitude: -75.917538,
    description: 'Heart of downtown Binghamton with shopping and dining',
    amenities: ['Restaurants', 'Shopping', 'Banks', 'Government Buildings'],
    isActive: true,
  },
  {
    id: 'riverwalk-bu-center',
    name: 'Riverwalk BU Center',
    latitude: 42.098765,
    longitude: -75.916543,
    description: 'Beautiful riverside walkway and community center',
    amenities: ['River Views', 'Walking Trails', 'Community Center', 'Parks'],
    isActive: true,
  },
  {
    id: 'confluence-park',
    name: 'Confluence Park',
    latitude: 42.090123,
    longitude: -75.912345,
    description: 'Scenic park at the confluence of rivers',
    amenities: ['Park', 'River Access', 'Picnic Areas', 'Nature Trails'],
    isActive: true,
  },
  {
    id: 'southside-walking-bridge',
    name: 'Southside Walking Bridge',
    latitude: 42.091409,
    longitude: -75.914568,
    description: 'Pedestrian bridge connecting communities',
    amenities: ['Bridge Access', 'River Views', 'Walking Path'],
    isActive: true,
  },
  {
    id: 'general-hospital',
    name: 'General Hospital',
    latitude: 42.086741,
    longitude: -75.915711,
    description: 'Major healthcare facility',
    amenities: ['Hospital', 'Medical Services', 'Emergency Care'],
    isActive: true,
  },
  {
    id: 'mcarthur-park',
    name: 'McArthur Park',
    latitude: 42.086165,
    longitude: -75.926153,
    description: 'Community park with recreational facilities',
    amenities: ['Playground', 'Sports Fields', 'Picnic Areas', 'Walking Trails'],
    isActive: true,
  },
  {
    id: 'greenway-path',
    name: 'Greenway Path',
    latitude: 42.086678,
    longitude: -75.932483,
    description: 'Scenic greenway for walking and cycling',
    amenities: ['Bike Path', 'Walking Trail', 'Nature Views', 'Exercise Stations'],
    isActive: true,
  },
  {
    id: 'vestal-center',
    name: 'Vestal Center',
    latitude: 42.091851,
    longitude: -75.951729,
    description: 'Commercial and community hub in Vestal',
    amenities: ['Shopping', 'Restaurants', 'Services', 'Parking'],
    isActive: true,
  },
  {
    id: 'innovation-park',
    name: 'Innovation Park',
    latitude: 42.093877,
    longitude: -75.958331,
    description: 'Technology and business innovation center',
    amenities: ['Business Center', 'Technology Hub', 'Conference Facilities'],
    isActive: true,
  },
  {
    id: 'bu-east-gym',
    name: 'BU East Gym',
    latitude: 42.091695,
    longitude: -75.963590,
    description: 'Binghamton University East Campus Recreation Center',
    amenities: ['Gym', 'Fitness Center', 'Sports Facilities', 'Student Services'],
    isActive: true,
  },
  {
    id: 'bu-fine-arts-building',
    name: 'BU Fine Arts Building',
    latitude: 42.089282,
    longitude: -75.967441,
    description: 'Arts and culture center at Binghamton University',
    amenities: ['Art Galleries', 'Performance Spaces', 'Studios', 'Cultural Events'],
    isActive: true,
  },
  {
    id: 'whitney-hall',
    name: 'Whitney Hall',
    latitude: 42.088456,
    longitude: -75.965432,
    description: 'Academic building at Binghamton University',
    amenities: ['Classrooms', 'Lecture Halls', 'Study Spaces', 'Academic Services'],
    isActive: true,
  },
  {
    id: 'student-union',
    name: 'Student Union',
    latitude: 42.086903,
    longitude: -75.966704,
    description: 'Central hub of student life at Binghamton University',
    amenities: ['Food Court', 'Student Services', 'Meeting Rooms', 'Study Spaces'],
    isActive: true,
  },
  {
    id: 'appalachian-dining',
    name: 'Appalachian Dining',
    latitude: 42.084523,
    longitude: -75.971264,
    description: 'Dining hall serving the Appalachian community',
    amenities: ['Dining Hall', 'Food Services', 'Residential Area'],
    isActive: true,
  },
  {
    id: 'hinman-dining-hall',
    name: 'Hinman Dining Hall',
    latitude: 42.086314,
    longitude: -75.973292,
    description: 'Main dining facility in Hinman community',
    amenities: ['Dining Hall', 'Food Services', 'Student Housing Area'],
    isActive: true,
  },
  {
    id: 'bu-science-building',
    name: 'BU Science Building',
    latitude: 42.090227,
    longitude: -75.972315,
    description: 'Science and research facilities at Binghamton University',
    amenities: ['Laboratories', 'Research Facilities', 'Classrooms', 'Science Library'],
    isActive: true,
  },
  {
    id: 'downtown-station',
    name: 'Downtown Station',
    latitude: 42.101234,
    longitude: -75.915678,
    description: 'Central transportation hub and drop-off location',
    amenities: ['Drop-off Point', 'Waiting Area', 'Shelter', 'Information Desk'],
    isActive: true,
  },
];

export const getActiveSpotsData = (): SpotData[] => {
  return spotsData.filter(spot => spot.isActive);
};
