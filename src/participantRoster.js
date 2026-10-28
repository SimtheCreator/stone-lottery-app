export const EXPECTED_PARTICIPANTS = Object.freeze([
  '30063',
  '30141',
  '30009',
  '30400',
  '30226',
  '30384',
  '30661',
  '30689',
  '30047',
  '30090',
  '30374',
  '30746',
  '30654',
  '30695',
  '30729',
  '30156',
  '30178',
  '30180',
  '30295',
  '30458',
  '30579',
  '30039',
  '30551',
  '30671',
  '30690',
  '30700',
  '30370',
  '30748',
  '30316',
  '30169',
  '30387',
  '30402',
  '30121',
  '30336',
  '30769',
  '30767',
  '30346',
  '30736',
  '30173',
  '30233',
  '30441',
  '30572',
  '30074',
  '30245',
  'IL201',
]);

export const normalizeParticipantCode = (value) => (
  String(value ?? '').trim().toUpperCase()
);

export const EXPECTED_PARTICIPANT_SET = new Set(EXPECTED_PARTICIPANTS);

export const isExpectedParticipant = (value) => (
  EXPECTED_PARTICIPANT_SET.has(normalizeParticipantCode(value))
);
