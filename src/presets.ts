import type { BadgePreset } from './types'

const base: BadgePreset = {
  size: 40,
  boxWidth: 48,
  boxHeight: 48,
  sidePadding: 50,
  displayName: false,
}

const small: BadgePreset = {
  size: 35,
  boxWidth: 38,
  boxHeight: 38,
  sidePadding: 50,
  displayName: false,
}

const medium: BadgePreset = {
  size: 50,
  boxWidth: 80,
  boxHeight: 90,
  sidePadding: 20,
  displayName: true,
  nameLength: 10,
}

const large: BadgePreset = {
  size: 70,
  boxWidth: 90,
  boxHeight: 115,
  sidePadding: 20,
  displayName: true,
}

const xl: BadgePreset = {
  size: 90,
  boxWidth: 120,
  boxHeight: 130,
  sidePadding: 20,
  displayName: true,
}

export const presets = {
  small,
  base,
  medium,
  large,
  xl,
}
