from django import template

from apps.backoffice.stats import dashboard

register = template.Library()


@register.simple_tag
def cargoconnect_dashboard():
    """Chiffres de l'accueil de l'administration web."""
    return dashboard()
