# Исходный capture до исправления отмены чтения

Реальные captures из production build `f535ec3521fd277eeac12ba887ea9cd50de38293` сохранены без подмены истории. Gate дал 19 passed / 1 failed: WebKit conflict capture зарегистрировал runtime error `Cannot load blob` при полной перезагрузке во время `readMediaBackupSnapshot` → `Blob.arrayBuffer`. Сверки данных и контролируемый отказ от конфликтующего restore прошли; gate не объявляется чистым.

Trace показал pageerror между началом reload и новой navigation. Исправление заменяет profile/media backup чтения на отменяемый FileReader с cleanup по signal/pagehide; новый capture выполняется отдельно. Ни предупреждение не игнорируется, ни error assertion не удаляется. Эти кадры — original test fixtures, не личные материалы владельца и не финальная визуальная приёмка.
