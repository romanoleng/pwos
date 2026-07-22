-- 004: name the kids' share accounts for what they are.
--
-- Both children hold three EasyEquities products: a retirement annuity, a
-- tax-free savings account and a plain ZAR share account. The migration
-- labelled the third one "Investments", which reads as a category rather than
-- an account and collides with the section it sits in.
--
-- "EasyEquities ZAR" matches the naming already used for the EasyProperties
-- holding, so the two read as siblings.

update kids_accounts
set account = 'EasyEquities ZAR'
where account = 'Investments' and account_type = 'Investments';
