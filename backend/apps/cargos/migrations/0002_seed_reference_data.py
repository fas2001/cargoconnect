from django.db import migrations

CITIES = [
    # slug, nom FR, nom AR, région
    ("casablanca", "Casablanca", "الدار البيضاء", "Casablanca-Settat"),
    ("mohammedia", "Mohammedia", "المحمدية", "Casablanca-Settat"),
    ("el-jadida", "El Jadida", "الجديدة", "Casablanca-Settat"),
    ("settat", "Settat", "سطات", "Casablanca-Settat"),
    ("berrechid", "Berrechid", "برشيد", "Casablanca-Settat"),
    ("rabat", "Rabat", "الرباط", "Rabat-Salé-Kénitra"),
    ("sale", "Salé", "سلا", "Rabat-Salé-Kénitra"),
    ("temara", "Témara", "تمارة", "Rabat-Salé-Kénitra"),
    ("kenitra", "Kénitra", "القنيطرة", "Rabat-Salé-Kénitra"),
    ("tanger", "Tanger", "طنجة", "Tanger-Tétouan-Al Hoceïma"),
    ("tetouan", "Tétouan", "تطوان", "Tanger-Tétouan-Al Hoceïma"),
    ("larache", "Larache", "العرائش", "Tanger-Tétouan-Al Hoceïma"),
    ("al-hoceima", "Al Hoceïma", "الحسيمة", "Tanger-Tétouan-Al Hoceïma"),
    ("fes", "Fès", "فاس", "Fès-Meknès"),
    ("meknes", "Meknès", "مكناس", "Fès-Meknès"),
    ("taza", "Taza", "تازة", "Fès-Meknès"),
    ("oujda", "Oujda", "وجدة", "Oriental"),
    ("nador", "Nador", "الناظور", "Oriental"),
    ("berkane", "Berkane", "بركان", "Oriental"),
    ("marrakech", "Marrakech", "مراكش", "Marrakech-Safi"),
    ("safi", "Safi", "آسفي", "Marrakech-Safi"),
    ("essaouira", "Essaouira", "الصويرة", "Marrakech-Safi"),
    ("beni-mellal", "Béni Mellal", "بني ملال", "Béni Mellal-Khénifra"),
    ("khouribga", "Khouribga", "خريبكة", "Béni Mellal-Khénifra"),
    ("agadir", "Agadir", "أكادير", "Souss-Massa"),
    ("inezgane", "Inezgane", "إنزكان", "Souss-Massa"),
    ("taroudant", "Taroudant", "تارودانت", "Souss-Massa"),
    ("ouarzazate", "Ouarzazate", "ورزازات", "Drâa-Tafilalet"),
    ("errachidia", "Errachidia", "الرشيدية", "Drâa-Tafilalet"),
    ("guelmim", "Guelmim", "كلميم", "Guelmim-Oued Noun"),
    ("laayoune", "Laâyoune", "العيون", "Laâyoune-Sakia El Hamra"),
    ("dakhla", "Dakhla", "الداخلة", "Dakhla-Oued Ed-Dahab"),
]

CATEGORIES = [
    ("agroalimentaire", "Agroalimentaire", "مواد غذائية"),
    ("fruits-legumes", "Fruits et légumes", "فواكه وخضر"),
    ("produits-frais", "Produits frais / surgelés", "منتجات طازجة / مجمدة"),
    ("materiaux-construction", "Matériaux de construction", "مواد البناء"),
    ("electromenager", "Électroménager et électronique", "أجهزة منزلية وإلكترونية"),
    ("meubles", "Meubles", "أثاث"),
    ("textile", "Textile", "نسيج"),
    ("machines", "Machines et équipements", "آلات ومعدات"),
    ("vehicules", "Véhicules", "مركبات"),
    ("produits-agricoles", "Produits agricoles et bétail", "منتجات فلاحية ومواشي"),
    ("demenagement", "Déménagement", "نقل الأثاث"),
    ("palettes-colis", "Palettes et colis", "منصات وطرود"),
    ("vrac", "Vrac (sable, céréales...)", "بضائع سائبة"),
    ("autre", "Autre", "أخرى"),
]


def seed(apps, schema_editor):
    City = apps.get_model("cargos", "City")
    GoodsCategory = apps.get_model("cargos", "GoodsCategory")
    for slug, fr, ar, region in CITIES:
        City.objects.update_or_create(slug=slug, defaults={"name_fr": fr, "name_ar": ar, "region": region})
    for slug, fr, ar in CATEGORIES:
        GoodsCategory.objects.update_or_create(slug=slug, defaults={"name_fr": fr, "name_ar": ar})


class Migration(migrations.Migration):
    dependencies = [("cargos", "0001_initial")]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
