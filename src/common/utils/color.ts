import { pinyin } from 'pinyin-pro'

export const colorMd = '#0288D1'

export const colorDirMap = {
  a: '#00668C',
  b: '#FF7043',
  c: '#F06292',
  d: '#42A5F5',
  e: '#AB47BC',
  f: '#9575CD',
  g: '#4FC3F7',
  h: '#81C784',
  i: '#4DB6AC',
  j: '#4BA3C7',
  k: '#FFD54F',
  l: '#BFB53B',
  m: '#7DA453',
  n: '#22A7F2',
  o: '#FF5252',
  p: '#FF7330',
  q: '#BA68C8',
  r: '#C6402A',
  s: '#4DD0E1',
  t: '#4DB6AC',
  u: '#4CAF50',
  v: '#E64A19',
  w: '#B3BC6D',
  x: '#FF65A0',
  y: '#FBC02D',
  z: '#93CCF9',
}

export function convertToPinyin(str) {
  const pinyinArr = pinyin(str, {
    toneType: 'none',
  })
  return pinyinArr.replace(/\s/g, '')
}

export function genColor(char) {
  const isWord = /^[A-Z]$/i.test(char)
  const str = isWord ? char[0] : convertToPinyin(char)[0]
  const strLowerCase = str.toLowerCase()
  return (
    colorDirMap[strLowerCase]
    || colorDirMap[
      String.fromCharCode(
        97 + (strLowerCase.charCodeAt(0) % Object.keys(colorDirMap).length),
      )
    ]
  )
}
