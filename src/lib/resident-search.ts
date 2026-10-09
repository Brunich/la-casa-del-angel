import type {Resident} from '../domain';

function normalized(value:string):string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('es-MX').trim().replace(/\s+/g,' ');
}
export function filterResidents<T extends Pick<Resident,'full_name'|'room'>>(residents:readonly T[],query:string):T[] {
  const tokens = normalized(query).split(' ').filter(Boolean);
  return residents.filter(resident => {
    const searchable = normalized(`${resident.full_name} ${resident.room}`);
    return tokens.every(token => searchable.includes(token));
  });
}
