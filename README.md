# WordSwipe MVP (engshort)

## Run

정적 파일 앱이라 로컬 서버로 바로 실행할 수 있습니다.

```powershell
cd C:\Users\옥\myfiles\engshort
node serve.mjs
```

브라우저에서 `http://localhost:5173` 접속.

포트가 이미 사용 중이면:

```powershell
node serve.mjs 5180
```

## Included MVP Features

- CSV 로딩: `중등_수능필수영단어_1800.csv`
- 숏츠형 전체화면 배경 레이어(영상 우선, 실패 시 그라데이션 폴백)
- 시작 모드 선택: `가볍게 5문제`, `집중 10문제`, `몰입 15문제`, `무한모드`
- 문제 타입 6종
- 타입 3연속 금지
- 최근 단어(30) 재등장 제한
- 최근 배경(10) 중복 제한 + 60개 이상 배경(생성형 72개)
- 타이머 바 + 시간초과 자동 오답/다음 전환
- streak 기반 보상 카드(3~5 랜덤) + 10카드 안전장치 + 쿨다운
- 사운드 포함 + 기본 OFF 토글

## Notes

- 파일 열기(`file://`)가 아니라 로컬 서버로 실행해야 CSV fetch가 정상 동작합니다.
- Python이 없어도 `node serve.mjs`로 실행할 수 있습니다.
- 영상 배경을 쓰려면 `engshort/assets/video/loop01.mp4` 같은 파일을 추가하세요.
