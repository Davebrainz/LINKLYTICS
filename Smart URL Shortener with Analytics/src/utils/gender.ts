const femaleNames = ['aisha', 'ada', 'chioma', 'ngozi', 'funke', 'tolu', 'sarah', 'jessica', 'emily', 'amara', 'chidinma', 'kemi', 'yemi', 'blessing', 'faith', 'grace', 'jennifer', 'lisa', 'mary', 'amaka', 'tochi', 'precious', 'esther']
const maleNames = ['tochukwu', 'chinedu', 'emeka', 'tunde', 'musa', 'yashim', 'usah', 'john', 'david', 'michael', 'james', 'daniel', 'ikechukwu', 'obinna', 'femi', 'segun', 'wale']

export function detectGender(fullName: string): 'male' | 'female' {
  if (!fullName.trim()) return 'male'

  const firstName = fullName.trim().toLowerCase().split(/\s+/)[0]
  if (femaleNames.some((name) => firstName.includes(name))) return 'female'
  if (maleNames.some((name) => firstName.includes(name))) return 'male'
  return firstName.endsWith('a') ? 'female' : 'male'
}

export function getGenderedAvatar(gender: 'male' | 'female', seed: number): string {
  const normalizedSeed = Math.abs(seed) % 70
  return `https://randomuser.me/api/portraits/${gender === 'female' ? 'women' : 'men'}/${normalizedSeed}.jpg`
}
