import { vi } from 'vitest';
import { Screens } from '../src/config/screeningQueue';
import { ScreeningRepository } from '../src/repository/screening.repository';

/** A screening repository and queue that record what they were asked to do. */
export function fakeScreens(queued = 1) {
  const queueAssigned = vi.fn<ScreeningRepository['queueAssigned']>(async () => queued);
  const replaceJobKeywords = vi.fn<ScreeningRepository['replaceJobKeywords']>();
  const listForGroup = vi.fn<ScreeningRepository['listForGroup']>();
  const findOne = vi.fn<ScreeningRepository['findOne']>();
  const wake = vi.fn();
  const screening = {
    queueAssigned,
    replaceJobKeywords,
    listForGroup,
    findOne,
  } as unknown as ScreeningRepository;
  const screens: Screens = { screening, queue: { wake } };
  return { screens, queueAssigned, replaceJobKeywords, listForGroup, findOne, wake };
}
