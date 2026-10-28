# Повтор после FileReader, до metadata-only inventory

Реальные кадры из build `baa730346df0c1cebd6c6e79ac19c0bdd50115c5`, browser tests `d1261b090d116b1353f0f68ed0fc5a0ea35e95e8`. Целевой gate с одним worker дал **11 passed / 1 failed**: WebKit по-прежнему зарегистрировал native `Cannot load blob` при reload фонового media snapshot. Ошибка теперь проявилась внутри `FileReader.readAsArrayBuffer`: pagehide-abort не дал универсальной гарантии при browser teardown. Data/identity/readback assertions прошли, но capture не считается чистым.

Следующее исправление убирает чтение и хеширование медиабайтов из фонового inventory — для счётчиков достаточно валидации metadata/session rows. Explicit export/restore сохраняет полноценные SHA/binary проверки. Снимки и failed manifest сохранены, error assertion не отключается. Финальное доказательство будет создано отдельно из нового compiled source.
