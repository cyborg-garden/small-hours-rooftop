// FROZEN (director). The whole game is painted from this table. sRGB hex.
export const PAL = Object.freeze({
  ink: '#171925', chalk: '#9AA6D0', paper: '#EFE6D2', textInk: '#20212E',
  skyTop: '#1C2340', skyLow: '#34406A', haze: '#5A5F86', rose: '#B98A8A', dawn: '#E0B49A',
  star: '#C9CDE0', moon: '#DAD9CF',
  cityFar: '#3A4370', cityMid: '#2B335A', cityNear: '#1D2340',
  winWarm: '#E9B872', winCool: '#9FB7C9',
  deck: '#4A5480', deckShade: '#262C49', section: '#1B1F3A', sectionEdge: '#2A2E4C',
  parapet: '#5A6090', parapetShade: '#2C3152',
  cedar: '#6A5266', cedarWarm: '#B07A52', soil: '#2E2A3A', soilWet: '#1C1A28',
  leaf: '#3F7A6C', leafLight: '#63A088', leafDark: '#264A4C',
  giftLeaf: '#86AD6C', giftLeafDry: '#8F8C5C', stem: '#5E7A4A',
  pot: '#B5654A', potShade: '#7A4340', potLit: '#D98A5E', tag: '#EDE3C8',
  copper: '#C97B4A', copperLit: '#F0B987',
  joHat: '#D9B77A', joJacket: '#C8882F', joTrousers: '#2F6B6E', joSkin: '#C48A6A', joHair: '#2B2230',
  tamCoat: '#6F7F9E', tamCap: '#A8483A', tamSkin: '#8E5D45', tamTrousers: '#333A55', tray: '#8A6A50',
  warm: '#F2B766', warmLight: '#FFDDB0', warmSpill: '#A8744E', stairWall: '#C98F5A', stairTread: '#7A5440',
  marlow: '#7FD6A8', marlowDim: '#3E7F6A', marlowBox: '#59618A', amber: '#D9A24A',
  barrel: '#4E5B7A', barrelBand: '#2F3550', tank: '#39406A',
  water: '#9CC7D6', waterLit: '#E8F4F2', waterWarm: '#F6D9A6',
  moonLight: '#8FA4D6', fill: '#2A3158',
});
export const hex = (k) => PAL[k];
