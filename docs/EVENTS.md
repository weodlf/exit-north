# 이벤트 JSON 샘플 — 1장과 3장

아래는 [`data/events.json`](../data/events.json)에서 그대로 발췌한 실제 실행 노드다. 개별 노드는 세계 데이터의 `nodes` 배열에 넣는다. 전체 실행에는 `rules`, `items`, `flags`, `chapters`, `scenes` 레지스트리도 함께 필요하다. 전체 형식은 [`events.schema.json`](../schemas/events.schema.json)으로 검증한다.

## 필드 읽기

- `cost.hp`는 차감량, `cost.hunger`는 증가량이다. 모두 양의 정수다.
- `requires.missingFlags`는 일회성 수색을 막고 `allFlags`는 단서 기반 선택을 해제한다.
- `outcome`은 확정 결과이며, `chance` 선택은 `success`와 `failure`를 모두 가진다.
- `effects`는 결과 적용 시 증감값이다. 허기를 높이는 부담은 `cost.hunger`로만 선언한다.
- `addItems`는 소지품 증가, `addFlags`는 서사 단서다. 플래그는 보상이 반복되지 않도록 중복 없는 집합으로 보관한다.
- `scene_3d`는 장면 레지스트리의 키, `camera_mode`는 렌더러가 사용할 카메라 리그 이름이다.

## 1장: 적막의 아침, 붉은 낙인

라디오·외투·서류를 어떤 순서로 조사할지 정한다. 체력 비용이 낮은 서류 수색도 허기를 10 높인다. 수색과 이동을 같은 엔진 경로로 계산하며, 수색 완료 플래그는 같은 물품을 무한히 얻는 일을 막는다.

```json
{
  "id": "ch1.home",
  "chapterId": "ch1",
  "title": "돌아갈 수 없는\n아침이 밝았다.",
  "text": "아버지의 신발이 사라졌다. 문턱에는 낯선 군화가 남긴 흙이 말라붙어 있다.\n\n창밖의 확성기는 오늘도 같은 노래를 틀지만, 우리 집만 소리가 나지 않는다. 골목에 발소리가 들리기 전, 무엇을 가져갈지 정해야 한다.",
  "scene_3d": "home_dawn",
  "camera_mode": "third_person_follow",
  "choices": [
    {
      "id": "radio",
      "label": "장롱 뒤를 더듬는다",
      "description": "감춰 둔 외교 라디오를 찾는다. 이후 확률 선택에 도움이 된다.",
      "cost": {
        "hp": 4,
        "hunger": 9
      },
      "requires": {
        "missingFlags": [
          "radio_found"
        ]
      },
      "outcome": {
        "text": "먼지 속에서 낡은 라디오를 찾았다. 잡음 사이로, 모르는 도시의 아침이 들려온다.",
        "target": "ch1.home",
        "addItems": {
          "radio": 1
        },
        "addFlags": [
          "radio_found"
        ]
      }
    },
    {
      "id": "coat",
      "label": "아버지의 외투를 살핀다",
      "description": "안감에 감춰진 비상 자금 28달러를 찾는다.",
      "cost": {
        "hp": 3,
        "hunger": 7
      },
      "requires": {
        "missingFlags": [
          "cash_found"
        ]
      },
      "outcome": {
        "text": "안감의 실밥을 풀자 접힌 달러가 떨어진다. 아버지는 언제부터 준비하셨을까.",
        "target": "ch1.home",
        "effects": {
          "dollars": 28
        },
        "addFlags": [
          "cash_found"
        ]
      }
    },
    {
      "id": "papers",
      "label": "찢어진 서류를 맞춘다",
      "description": "나중에 위조 신분증을 마련할 단서를 확보한다.",
      "cost": {
        "hp": 2,
        "hunger": 10
      },
      "requires": {
        "missingFlags": [
          "id_clue"
        ]
      },
      "outcome": {
        "text": "도장 자국과 낯선 이름. 서류 뒷면에는 아버지의 글씨로 약속 장소가 적혀 있다.",
        "target": "ch1.home",
        "addFlags": [
          "id_clue"
        ]
      }
    },
    {
      "id": "leave",
      "label": "집을 나설 준비를 한다",
      "description": "챙기지 않은 단서는 이 방에 남는다.",
      "cost": {
        "hp": 3,
        "hunger": 6
      },
      "outcome": {
        "text": "문고리를 잡는다. 손바닥에 묻은 먼지가, 아직 이곳이 집이었다고 말해 준다.",
        "target": "ch1.passage"
      }
    }
  ]
}
```

1장의 서류 퍼즐은 다음 선택에서 연결된다. `id_clue`가 없으면 버튼을 보여 주되 잠금 이유를 안내한다.

```json
{
  "id": "forge",
  "label": "단서로 다른 이름을 준비한다",
  "description": "단서가 있다면 위조 신분증을 확보한다. 실제 제작 절차는 묘사하지 않는다.",
  "cost": {
    "hp": 2,
    "hunger": 4
  },
  "requires": {
    "allFlags": [
      "id_clue"
    ],
    "missingFlags": [
      "id_forged"
    ]
  },
  "outcome": {
    "text": "접힌 서류 속 다른 이름이 내 이름을 덮는다. 종이 한 장이 나를 지킬 수 있을까.",
    "target": "ch1.passage",
    "addItems": {
      "forged_id": 1
    },
    "addFlags": [
      "id_forged"
    ]
  }
}
```

`home_dawn`의 장면 선언은 다음과 같다.

```json
{
  "environment": "room",
  "assetKey": "environments/home-dawn",
  "spawn": "door_inside",
  "lighting": "cold_dawn",
  "hotspots": [
    "wardrobe",
    "coat",
    "papers",
    "door"
  ]
}
```

## 3장: 얼어붙은 검은 강

관찰과 준비로 확률을 높이거나, HP·허기·자금으로 위험을 분산한다. 실패 결과까지 명시해 무슨 손실을 받고 어디로 이어지는지 렌더러 밖에서 결정한다.

```json
{
  "id": "ch3.bank",
  "chapterId": "ch3",
  "title": "얼음 아래로,\n국경이 흐른다.",
  "text": "차가운 물 위로 흰빛이 지나간다. 얼음은 단단해 보이지만, 그 아래에서 무엇이 움직이는지 알 수 없다.\n\n먼저 건넌 사람은 돌아보지 않았다. 강가에는 값을 부르는 낯선 사람이 서 있다. 이제 무엇을 믿을 것인가.",
  "scene_3d": "frozen_river",
  "camera_mode": "third_person_follow",
  "choices": [
    {
      "id": "observe",
      "label": "불빛의 움직임을 지켜본다",
      "description": "허기를 감수하고 단서를 얻는다. 이후 도강 확률 +12%p.",
      "cost": {
        "hp": 4,
        "hunger": 10
      },
      "requires": {
        "missingFlags": [
          "light_observed"
        ]
      },
      "outcome": {
        "text": "오랫동안 빛을 바라보았다. 아무것도 확실하지 않지만, 막연한 두려움에 작은 윤곽이 생겼다.",
        "target": "ch3.bank",
        "effects": {
          "stealth": 6
        },
        "addFlags": [
          "light_observed"
        ]
      }
    },
    {
      "id": "sprint",
      "label": "얼음 위를 빠르게 달린다",
      "description": "HP 소모가 크다. 라디오와 관찰 단서가 확률에 영향을 준다.",
      "cost": {
        "hp": 18,
        "hunger": 8
      },
      "chance": {
        "base": 0.5,
        "min": 0.1,
        "max": 0.96,
        "modifiers": [
          {
            "stat": "stealth",
            "factor": 0.002
          },
          {
            "flag": "radio_found",
            "add": 0.12
          },
          {
            "flag": "light_observed",
            "add": 0.12
          }
        ]
      },
      "success": {
        "text": "발아래서 얼음이 울었다. 멈추지 않고 달려, 건너편의 젖은 흙을 붙잡았다.",
        "target": "ch3.shelter",
        "addFlags": [
          "river_crossed"
        ]
      },
      "failure": {
        "text": "얼음이 무너지며 다리가 물에 잠겼다. 가까스로 기어 나왔지만 몸과 주머니에서 온기가 빠져나갔다.",
        "target": "ch3.shelter",
        "effects": {
          "hp": -18,
          "dollars": -8,
          "stealth": -16
        },
        "addFlags": [
          "river_crossed"
        ]
      }
    },
    {
      "id": "sneak",
      "label": "그늘을 따라 천천히 건넌다",
      "description": "HP는 아끼지만 허기가 크게 오른다. 실패하면 추가 부상.",
      "cost": {
        "hp": 8,
        "hunger": 18
      },
      "chance": {
        "base": 0.64,
        "min": 0.1,
        "max": 0.96,
        "modifiers": [
          {
            "stat": "stealth",
            "factor": 0.0015
          },
          {
            "flag": "light_observed",
            "add": 0.12
          }
        ]
      },
      "success": {
        "text": "아주 오래 걸린 것 같았다. 고개를 들었을 때, 불빛은 이미 등 뒤에 있었다.",
        "target": "ch3.shelter",
        "effects": {
          "stealth": 4
        },
        "addFlags": [
          "river_crossed"
        ]
      },
      "failure": {
        "text": "빛이 멈춘 순간 몸을 던졌다. 차가운 물에 살이 베였지만 강 건너에 닿았다.",
        "target": "ch3.shelter",
        "effects": {
          "hp": -14,
          "stealth": -12
        },
        "addFlags": [
          "river_crossed"
        ]
      }
    },
    {
      "id": "broker",
      "label": "안내인에게 자금을 건넨다",
      "description": "40달러를 쓴다. 실패하면 강가에 남고 자금은 돌려받지 못한다.",
      "cost": {
        "hp": 6,
        "hunger": 10,
        "dollars": 40
      },
      "chance": {
        "base": 0.82,
        "min": 0.1,
        "max": 0.96,
        "modifiers": [
          {
            "flag": "radio_found",
            "add": 0.08
          }
        ]
      },
      "success": {
        "text": "돈을 받은 사람은 말없이 고개를 끄덕였다. 낯선 발자국을 따라 강을 넘었다.",
        "target": "ch3.shelter",
        "addFlags": [
          "river_crossed"
        ]
      },
      "failure": {
        "text": "기다리라는 말만 남기고 안내인이 사라졌다. 찬 바람 속에서, 다시 혼자 선택해야 한다.",
        "target": "ch3.bank",
        "effects": {
          "hp": -8,
          "stealth": -6
        }
      }
    }
  ]
}
```

`frozen_river`의 3D 매핑:

```json
{
  "environment": "river",
  "assetKey": "environments/frozen-river",
  "spawn": "near_bank",
  "lighting": "moon_searchlight",
  "hotspots": [
    "observe",
    "ice_crossing",
    "broker"
  ]
}
```

### 동일 상태에서 선택을 비교하는 예

HP 60·허기 60·은밀도 76·라디오·관찰 단서 보유·$46 상태라면:

| 선택 | 판정 전 HP/허기/돈 | 계산 확률 | 실패 시 추가 변화 |
|---|---|---|---|
| 달리기 | 42 / 68 / $46 | 50%+15.2%p+12%p+12%p = 89.2% | HP −18, $−8, 은밀도 −16 후 건너편 |
| 은신 | 52 / 78 / $46 | 64%+11.4%p+12%p = 87.4% | HP −14, 은밀도 −12 후 건너편 |
| 안내인 | 54 / 70 / $6 | 82%+8%p = 90% | HP −8, 은밀도 −6 후 강가에 남음 |

이 상태에서는 허기가 아직 100이 아니므로 아사 피해가 없다. 허기 90에서 같은 은신을 선택하면 먼저 허기가 100으로 제한되고 HP 8+5를 차감한 다음 결과를 판정한다. 돈이 $39라면 안내인 선택을 거부하고 어떤 비용도 내지 않는다.

실제 접경지의 지리·확률·검문 절차와 대응하지 않는 허구의 게임 데이터다. 3D 전환도 이 수치를 그대로 사용하고 빛·얼음의 시각 표현으로 비용을 이중 부과하지 않는다.
